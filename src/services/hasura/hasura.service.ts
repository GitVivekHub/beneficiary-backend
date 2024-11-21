import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import axios from 'axios';
import { ErrorResponse } from 'src/common/responses/error-response';
import { SuccessResponse } from 'src/common/responses/success-response';

@Injectable()
export class HasuraService {
  private hasurastate = process.env.HASURA_state;
  private adminSecretKey = process.env.HASURA_GRAPHQL_ADMIN_SECRET;
  private cache_db = process.env.CACHE_DB;
  private response_cache_db = process.env.RESPONSE_CACHE_DB;
  private seeker_db = process.env.SEEKER_DB;
  private order_db = process.env.ORDER_DB;
  private telemetry_db = process.env.TELEMETRY_DB;
  private url = process.env.HASURA_URL;

  constructor(private httpService: HttpService) {
    console.log('cache_db', this.cache_db);
    console.log('response_cache_db', this.response_cache_db);
  }

  async findJobsCache(requestBody) {
    console.log('searching jobs from ' + this.cache_db);

    const { filters, search } = requestBody;
    // let result = 'where: {';
    // Object.entries(getContentdto).forEach(([key, value]) => {
    //   console.log(`${key}: ${value}`);

    //   console.log('557', `${key}: ${value}`);
    //   result += `${key}: {_eq: "${value}"}, `;
    // });
    // result += '}';
    // console.log('result', result);
    //console.log("order", order)
    const query = `query MyQuery {
           ${this.cache_db}(distinct_on: unique_id) {
            id
            unique_id
            item_id
            provider_id
            provider_name
            bpp_id
            bpp_uri
            title
            description
            url
            item
            descriptor
            categories
            fulfillments
          }
          }`;
    try {
      const response = await this.queryDb(query);
      const jobs = response.data[this.cache_db];

      const filteredJobs = this.filterJobs(jobs, filters, search);

      // Return the response in the desired format
      return new SuccessResponse({
        statusCode: HttpStatus.OK,
        message: 'Ok.',
        data: {
          ubi_network_cache: filteredJobs,
        },
      });
    } catch (error) {
      //this.logger.error("Something Went wrong in creating Admin", error);
      return new ErrorResponse({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorMessage: error.message, // Use error message if available
      });
    }
  }

  filterJobs(jobs, filters, search) {
    if (!filters && !search) return jobs;

    // Utility function to check if a value falls within a range
    const isIncomeInRange = (incomeValue, targetRange) => {
      const [targetMin, targetMax] = targetRange.split('-').map(Number);

      if (incomeValue.includes('-')) {
        const [incomeMin, incomeMax] = incomeValue.split('-').map(Number);
        return incomeMin <= targetMax && incomeMax >= targetMin;
      } else {
        const incomeNumber = parseFloat(incomeValue);
        return incomeNumber >= targetMin && incomeNumber <= targetMax;
      }
    };

    const matchFilter = (tags, filterConfig) => {
      const { parentCode, filterValue, isRange } = filterConfig;

      const parentTag = tags.find((tag) => tag.descriptor?.code === parentCode);

      if (!parentTag || !Array.isArray(parentTag.list)) return false;

      return parentTag.list.some((item) => {
        const value = item.value?.trim(); // Ensure we account for empty values
        // Allow match if value is empty or matches the filter
        if (value === '') return true;

        if (isRange) {
          return isIncomeInRange(value, filterValue);
        }

        const values = value.split(',').map((v) => v.trim().toLowerCase());
        return values.includes(filterValue.toLowerCase());
      });
    };

    return jobs.filter((job) => {
      let matches = true;

      // Title search (case-insensitive)
      if (search) {
        matches =
          job.title?.toLowerCase()?.includes(search.toLowerCase()) ?? false;
      }

      if (!matches) return false;

      if (!filters || Object.keys(filters).length === 0) return true;

      const tags = job.item?.tags;
      if (!Array.isArray(tags)) {
        return false;
      }

      const filterConfigs = [
        {
          filterKey: 'academicClass-eligibility',
          parentCode: 'educational-eligibility',
          filterCode: 'academicClass-eligibility',
        },
        {
          filterKey: 'caste-eligibility',
          parentCode: 'personal-eligibility',
          filterCode: 'caste-eligibility',
        },
        {
          filterKey: 'annualIncome-eligibility',
          parentCode: 'economical-eligibility',
          filterCode: 'annualIncome-eligibility',
          isRange: true,
        },
        {
          filterKey: 'state-eligibility',
          parentCode: 'geographical-eligibility',
          filterCode: 'state-eligibility',
        },
      ];

      matches = filterConfigs.every(
        ({ filterKey, parentCode, filterCode, isRange }) => {
          return filters[filterKey]
            ? matchFilter(tags, {
                parentCode,
                filterCode,
                filterValue: filters[filterKey],
                isRange,
              })
            : true;
        },
      );

      return matches;
    });
  }

  async searchResponse(data) {
    console.log('searching response from ' + this.response_cache_db);

    let result = 'where: {';
    Object.entries(data).forEach(([key, value]) => {
      console.log(`${key}: ${value}`);

      console.log('557', `${key}: ${value}`);
      result += `${key}: {_eq: "${value}"}, `;
    });
    result += '}';
    console.log('result', result);
    //console.log("order", order)
    const query = `query MyQuery {
            ${this.response_cache_db}(${result}) {
                id
                action
                transaction_id
                response
          }
          }`;
    try {
      const response = await this.queryDb(query);
      return response;
    } catch (error) {
      //this.logger.error("Something Went wrong in creating Admin", error);
      console.log('error', error);
      throw new HttpException(
        'Unable to Fetch content!',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async insertCacheData(arrayOfObjects) {
    console.log('inserting jobs into ' + this.cache_db);
    console.log('arrayOfObjects', arrayOfObjects);
    // $provider_id: String, provider_name: String, bpp_id: String, bpp_uri: String
    // provider_id: $provider_id, provider_name: $provider_name, bpp_id: $bpp_id, bpp_uri: $bpp_uri
    const query = `mutation MyMutation($title: String, $description: String, $url: String, $provider_name: String, $enrollmentEndDate: timestamptz, $bpp_id: String, $unique_id: String, $bpp_uri: String, $item_id: String, $offeringInstitute: jsonb, $credits: String, $instructors: String,$provider_id: String, $item: json, $descriptor: json, $categories: json, $fulfillments: json) { 
            insert_${this.cache_db}(objects: {title: $title, description: $description, url: $url, provider_name: $provider_name, enrollmentEndDate: $enrollmentEndDate, bpp_id: $bpp_id, unique_id: $unique_id, bpp_uri: $bpp_uri, item_id: $item_id, offeringInstitute: $offeringInstitute credits: $credits, instructors: $instructors, provider_id:$provider_id, item: $item, descriptor: $descriptor, categories: $categories, fulfillments: $fulfillments}) {
            returning {
              item_id
              unique_id
            }
          }
        }
        `;

    let promises = [];
    arrayOfObjects.forEach((item) => {
      promises.push(this.queryDb(query, item));
    });

    let insertApiRes = await Promise.all(promises);
    console.log('insertApiRes', insertApiRes);
    return insertApiRes;

    // try {
    //   const response = await this.queryDb(query, filteredArray[0] );
    //   return response
    // } catch (error) {
    //   throw new HttpException('Failed to create Content', HttpStatus.NOT_FOUND);
    // }
  }

  async queryDb(query: string, variables?: Record<string, any>): Promise<any> {
    try {
      console.log('querydbDetails', query, variables, this.adminSecretKey);
      const response = await axios.post(
        this.url,
        {
          query,
          variables,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-hasura-admin-secret': this.adminSecretKey,
          },
        },
      );
      console.log('response.data', response.data);
      return response.data;
    } catch (error) {
      console.log('error', error);
      return error;
    }
  }

  async getState() {
    const query = `query MyQuery {
            ${this.cache_db}(distinct_on: state,where: { state: { _neq: "" } }) {
              state
            }
          }
        `;

    try {
      return await this.queryDb(query);
    } catch (error) {
      throw new HttpException('Bad request', HttpStatus.BAD_REQUEST);
    }
  }

  async getCity(state: string) {
    const query = `query MyQuery {
            ${this.cache_db}(distinct_on: city, where: {state: {_eq: "${state}"}}) {
              city
            }
          }
        `;

    try {
      return await this.queryDb(query);
    } catch (error) {
      throw new HttpException('Bad request', HttpStatus.BAD_REQUEST);
    }
  }

  async getTitle() {
    const query = `query MyQuery {
            ${this.cache_db}(distinct_on: title) {
              title
            }
          }
        `;
    try {
      return await this.queryDb(query);
    } catch (error) {
      throw new HttpException('Bad request', HttpStatus.BAD_REQUEST);
    }
  }

  async deleteResponse() {
    const query = `mutation MyMutation {
            delete_${this.response_cache_db}(where: {}) {
              affected_rows
            }
          }
        `;
    try {
      return await this.queryDb(query);
    } catch (error) {
      throw new HttpException('Bad request', HttpStatus.BAD_REQUEST);
    }
  }

  async deleteJobs() {
    const query = `mutation MyMutation {
            delete_${this.cache_db}(where: {}) {
              affected_rows
            }
          }
        `;
    try {
      return await this.queryDb(query);
    } catch (error) {
      throw new HttpException('Bad request', HttpStatus.BAD_REQUEST);
    }
  }

  async createSeekerUser(seeker) {
    const query = `mutation InsertSeeker($email: String , $name:String, $age:String, $gender:String, $phone:String) {
     insert_${this.seeker_db}(objects: {email: $email, name: $name ,age: $age, gender: $gender, phone: $phone}) {
        affected_rows
        returning {
          id
          email
          name
          gender
          age
          phone
        }
      
    }
    }`;

    console.log(query);

    // Rest of your code to execute the query

    try {
      const response = await this.queryDb(query, seeker);
      return response.data[`insert_${this.seeker_db}`].returning[0];
    } catch (error) {
      throw new HttpException(
        'Unabe to creatre Seeker user',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async findSeekerUser(email) {
    const query = `query MyQuery {
      ${this.seeker_db}(where: {email: {_eq: "${email}"}}) {
        id
        name
        email
        phone
      }
    }
    `;

    console.log(query);

    // Rest of your code to execute the query

    try {
      const response = await this.queryDb(query);
      return response.data[`${this.seeker_db}`][0];
    } catch (error) {
      throw new HttpException(
        'Unabe to create order user',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async createOrder(order) {
    const query = `mutation InsertOrder($content_id: String, $seeker_id: Int, $order_id: String) {
      insert_${this.order_db}(objects: {content_id: $content_id, seeker_id: $seeker_id, order_id: $order_id}) {
        affected_rows
        returning {
          content_id
          id
          order_id
          seeker_id
        }
      }
    }
    `;

    // console.log(query)

    // Rest of your code to execute the query

    try {
      const response = await this.queryDb(query, order);
      return response;
    } catch (error) {
      throw new HttpException(
        'Unabe to create order user',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async searchOrderByOrderId(order) {
    console.log('order', order);
    const query = `query MyQuery {
      ${this.order_db}(where: {order_id: {_eq: "${order}"}}) {
        OrderContentRelationship {
          bpp_id
          bpp_uri
          id
          provider_id
          provider_name
         
        }
      }
    }
    `;

    //console.log(query)

    // Rest of your code to execute the query

    try {
      const response = await this.queryDb(query);
      return response.data[`${this.order_db}`][0].OrderContentRelationship[0];
    } catch (error) {
      throw new HttpException('Invalid order id', HttpStatus.BAD_REQUEST);
    }
  }

  async addTelemetry(data) {
    console.log('data', data);
    const query = `
      mutation ($id: String, $ver: String, $events:jsonb) {
        insert_${this.telemetry_db}(objects: [{id: $id, ver: $ver, events: $events}]) {
          returning {
            id
            events
          }
        }
      }
    `;

    console.log(query);

    try {
      const response = await this.queryDb(query, data);
      return response;
    } catch (error) {
      throw new HttpException('Unabe to add telemetry', HttpStatus.BAD_REQUEST);
    }
  }
}
