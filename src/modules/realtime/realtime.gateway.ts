import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { PresenceService } from './presence.service';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/',
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly presence: PresenceService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      client.data.userId = payload.sub;
      client.data.email = payload.email;

      const orgId = client.handshake.auth?.organizationId;
      if (orgId) {
        client.data.organizationId = orgId;
        client.join(`org:${orgId}`);
      }

      await this.presence.setOnline(client.data.userId, orgId);

      this.logger.log(`Client connected: ${client.data.userId} (org: ${orgId})`);
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    if (client.data.userId) {
      await this.presence.setOffline(
        client.data.userId,
        client.data.organizationId,
      );
      this.logger.log(`Client disconnected: ${client.data.userId}`);
    }
  }

  @SubscribeMessage('join:conversation')
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.join(`conv:${data.conversationId}`);
    client.data.activeConversationId = data.conversationId;
    this.presence.setActiveConversation(
      client.data.userId,
      client.data.organizationId,
      data.conversationId,
    );
  }

  @SubscribeMessage('leave:conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.leave(`conv:${data.conversationId}`);
    client.data.activeConversationId = null;
    this.presence.setActiveConversation(
      client.data.userId,
      client.data.organizationId,
      null,
    );
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ) {
    client.to(`conv:${data.conversationId}`).emit('agent:typing', {
      userId: client.data.userId,
      conversationId: data.conversationId,
      isTyping: data.isTyping,
    });
  }

  emitToOrg(orgId: string, event: string, data: any) {
    this.server.to(`org:${orgId}`).emit(event, data);
  }

  emitToConversation(conversationId: string, event: string, data: any) {
    this.server.to(`conv:${conversationId}`).emit(event, data);
  }
}
