import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { AiTool, ToolContext, ToolResult } from '../tool.types';

/**
 * Returns the full pitch + price + checkout link for a product owned by
 * the org. Sales agents see a compact list of all products in their
 * system prompt and call this skill with a slug when actually
 * recommending — keeps the prompt small while letting the agent
 * pull authoritative copy on demand instead of inventing.
 */
@Injectable()
export class GetProductPitchTool implements AiTool {
  private readonly logger = new Logger(GetProductPitchTool.name);

  readonly name = 'getProductPitch';
  readonly description =
    'Puxa o pitch completo + preço + link de checkout de um produto do catálogo. Use ANTES de citar preço/link/diferenciais — não invente nada, sempre busque aqui. Slug vem da lista no system prompt.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['slug'],
    properties: {
      slug: {
        type: 'string',
        description:
          'Slug do produto (ex: "maestria"). Lista de slugs disponível no Catálogo do system prompt.',
        minLength: 1,
        maxLength: 60,
      },
    },
  };

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const slug = String(input.slug ?? '').trim().toLowerCase();
    if (!slug) {
      return {
        output: { ok: false, error: 'slug obrigatório' },
      };
    }

    const product = await this.prisma.product.findUnique({
      where: {
        organizationId_slug: {
          organizationId: ctx.organizationId,
          slug,
        },
      },
    });

    if (!product || !product.isActive) {
      return {
        output: {
          ok: false,
          error: `Produto "${slug}" não encontrado ou inativo. Confira a lista de slugs no Catálogo.`,
        },
      };
    }

    this.logger.log(
      `getProductPitch served ${slug} (org=${ctx.organizationId})`,
    );

    return {
      output: {
        ok: true,
        product: {
          slug: product.slug,
          name: product.name,
          category: product.category,
          shortLine: product.shortLine,
          pitch: product.pitch,
          price: product.price,
          paymentLink: product.paymentLink,
          targetAudience: product.targetAudience,
          differentiators: product.differentiators,
        },
      },
    };
  }
}
