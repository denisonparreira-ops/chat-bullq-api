import { IsEnum, IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChannelType } from '@prisma/client';

export class CreateChannelDto {
  @ApiProperty({ enum: ChannelType })
  @IsEnum(ChannelType)
  type: ChannelType;

  @ApiProperty({ example: 'WhatsApp Principal' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Provider credentials (token, instanceKey, etc)',
    example: { baseUrl: 'https://api.uazapi.com', instanceKey: 'my-instance', token: 'my-token' },
  })
  @IsObject()
  config: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  webhookSecret?: string;
}
