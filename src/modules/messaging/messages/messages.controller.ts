import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard, OrgGuard, RolesGuard } from '../../../common/guards';
import { CurrentUser, CurrentOrg } from '../../../common/decorators';

@ApiTags('Messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard, RolesGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly service: MessagesService) {}

  @Post()
  @ApiOperation({ summary: 'Send a message (enqueues for delivery)' })
  send(
    @Body() dto: SendMessageDto,
    @CurrentUser('id') userId: string,
    @CurrentOrg('id') orgId: string,
  ) {
    return this.service.send(dto, userId, orgId);
  }

  @Get()
  @ApiOperation({ summary: 'List messages of a conversation (paginated)' })
  @ApiQuery({ name: 'conversationId', required: true })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findByConversation(
    @Query('conversationId') conversationId: string,
    @CurrentOrg('id') orgId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findByConversation(
      conversationId,
      orgId,
      parseInt(page || '1', 10),
      parseInt(limit || '50', 10),
    );
  }
}
