import type { Card, CaseFile } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { ToolContext } from '../tools/tool.types';

/**
 * Acha o card relevante pra esta conversa/contato — primeiro por
 * conversationId (caso mais comum: o card já foi ligado à conversa pela
 * automação de cascata comercial→jurídico), com fallback pro card mais
 * recente do contato que ainda não tem pasta de caso. Compartilhado pelas
 * tools de caseFile pra manter a mesma heurística em todo lugar.
 */
export async function resolveCardForContext(
  prisma: PrismaService,
  ctx: ToolContext,
): Promise<(Card & { caseFile: CaseFile | null }) | null> {
  const byConversation = await prisma.card.findFirst({
    where: { conversationId: ctx.conversationId, organizationId: ctx.organizationId },
    include: { caseFile: true },
    orderBy: { createdAt: 'desc' },
  });
  if (byConversation) return byConversation;

  return prisma.card.findFirst({
    where: {
      contactId: ctx.contactId,
      organizationId: ctx.organizationId,
      caseFile: null,
    },
    include: { caseFile: true },
    orderBy: { createdAt: 'desc' },
  });
}

/** Acha a pasta de caso já existente pra esta conversa/contato, ou null. */
export async function resolveCaseFileForContext(
  prisma: PrismaService,
  ctx: ToolContext,
): Promise<CaseFile | null> {
  const byConversation = await prisma.caseFile.findFirst({
    where: { card: { conversationId: ctx.conversationId }, organizationId: ctx.organizationId },
    orderBy: { createdAt: 'desc' },
  });
  if (byConversation) return byConversation;

  return prisma.caseFile.findFirst({
    where: { contactId: ctx.contactId, organizationId: ctx.organizationId },
    orderBy: { createdAt: 'desc' },
  });
}
