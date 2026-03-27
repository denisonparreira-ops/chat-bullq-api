import { Module } from '@nestjs/common';
import { ZappfyInboundAdapter } from './zappfy.inbound-adapter';
import { ZappfyOutboundAdapter } from './zappfy.outbound-adapter';
import { ZappfyMessageMapper } from './zappfy.message-mapper';
import { ZappfyHttpClient } from './zappfy.http-client';

@Module({
  providers: [
    ZappfyInboundAdapter,
    ZappfyOutboundAdapter,
    ZappfyMessageMapper,
    ZappfyHttpClient,
  ],
  exports: [ZappfyInboundAdapter, ZappfyOutboundAdapter, ZappfyHttpClient],
})
export class ZappfyModule {}
