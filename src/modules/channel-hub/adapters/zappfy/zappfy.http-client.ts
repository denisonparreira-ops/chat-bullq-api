import { Injectable, Logger } from '@nestjs/common';
import { Channel } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';

interface ZappfyConfig {
  baseUrl: string;
  token: string;
  instanceKey: string;
}

@Injectable()
export class ZappfyHttpClient {
  private readonly logger = new Logger(ZappfyHttpClient.name);

  private getClientConfig(channel: Channel): ZappfyConfig {
    const config = channel.config as Record<string, any>;
    return {
      baseUrl: config.baseUrl || 'https://api.uazapi.com',
      token: config.token,
      instanceKey: config.instanceKey,
    };
  }

  private createClient(channel: Channel): AxiosInstance {
    const cfg = this.getClientConfig(channel);
    return axios.create({
      baseURL: `${cfg.baseUrl}/instance/${cfg.instanceKey}`,
      headers: { token: cfg.token },
      timeout: 30000,
    });
  }

  async sendRequest(
    channel: Channel,
    endpoint: string,
    payload: Record<string, any>,
  ): Promise<any> {
    const client = this.createClient(channel);
    try {
      const response = await client.post(endpoint, payload);
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `Zappfy API error: ${endpoint} - ${error.response?.data?.message || error.message}`,
      );
      throw error;
    }
  }

  async getInstanceStatus(channel: Channel): Promise<any> {
    const client = this.createClient(channel);
    try {
      const response = await client.get('/status');
      return response.data;
    } catch (error: any) {
      this.logger.error(`Zappfy status check failed: ${error.message}`);
      throw error;
    }
  }

  async getMediaBuffer(
    channel: Channel,
    mediaUrl: string,
  ): Promise<Buffer> {
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
    });
    return Buffer.from(response.data);
  }
}
