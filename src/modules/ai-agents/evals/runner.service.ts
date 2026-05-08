import { Injectable, Logger } from '@nestjs/common';
import { JudgeService } from './judge.service';
import {
  EvalAgentResponse,
  EvalAssertion,
  EvalCase,
  EvalResult,
} from './types';

/**
 * Executa um EvalCase contra um agent específico, coleta a resposta
 * (tool calls, mensagem final, finalAction) e aplica todas as assertions
 * declarativas. Asserções subjetivas (`judgeQuestion`) delegam pro
 * JudgeService.
 *
 * A invocação real do agent ainda é STUB — Fase 2 vai conectar com o
 * agent-runner em modo dryRun (sem persistir no banco, sem mandar
 * mensagem real pro WhatsApp).
 */
@Injectable()
export class EvalRunnerService {
  private readonly logger = new Logger(EvalRunnerService.name);

  constructor(private readonly judge: JudgeService) {}

  /**
   * Roda um caso de teste contra o agent. Retorna o resultado com lista
   * de falhas (vazia se passou) e métricas de custo/duração.
   */
  async runCase(testCase: EvalCase, agentId: string): Promise<EvalResult> {
    const startedAt = Date.now();

    this.logger.log({
      msg: 'eval_case_started',
      caseName: testCase.name,
      agentId,
    });

    // TODO Fase 2: integrar com agent-runner.service.ts dryRun mode
    // O stub abaixo retorna uma resposta vazia — ainda assim a lógica de
    // assertions é exercitada (e vai falhar nas verificações, o que é o
    // comportamento desejado até a integração real).
    const agentResponse = await this.invokeAgentStub(testCase, agentId);
    const costUsd = 0;

    const failures: string[] = [];

    await this.assertToolCalls(testCase.expect, agentResponse, failures);
    this.assertMessageContent(testCase.expect, agentResponse, failures);
    this.assertFinalAction(testCase.expect, agentResponse, failures);
    await this.assertJudge(testCase.expect, agentResponse, failures);

    const durationMs = Date.now() - startedAt;
    const passed = failures.length === 0;

    this.logger.log({
      msg: 'eval_case_completed',
      caseName: testCase.name,
      agentId,
      passed,
      failuresCount: failures.length,
      durationMs,
      costUsd,
    });

    return {
      case: testCase,
      passed,
      failures,
      agentResponse,
      costUsd,
      durationMs,
    };
  }

  // ─── agent invocation (STUB) ─────────────────────────────────────

  /**
   * STUB: retorna resposta vazia para que a estrutura de assertions seja
   * exercitada. Fase 2 vai trocar por uma chamada real ao
   * AiAgentRunnerService.run em modo dryRun, capturando os tool calls
   * via spy e o stopReason via retorno.
   */
  private async invokeAgentStub(
    testCase: EvalCase,
    agentId: string,
  ): Promise<EvalAgentResponse> {
    this.logger.warn(
      `invokeAgentStub: returning empty response for case=${testCase.name} agent=${agentId} ` +
        `(integration pending — see TODO Fase 2)`,
    );
    return {
      toolCalls: [],
      finalMessage: '',
      finalAction: 'IGNORED',
    };
  }

  // ─── assertions ──────────────────────────────────────────────────

  private async assertToolCalls(
    expect: EvalAssertion,
    response: EvalAgentResponse,
    failures: string[],
  ): Promise<void> {
    const calledNames = new Set(response.toolCalls.map((tc) => tc.name));

    if (expect.toolCalls && expect.toolCalls.length > 0) {
      for (const required of expect.toolCalls) {
        if (!calledNames.has(required)) {
          failures.push(
            `Esperado tool "${required}" ser chamado, mas não foi. ` +
              `Tools chamados: [${[...calledNames].join(', ') || 'nenhum'}]`,
          );
        }
      }
    }

    if (expect.shouldNotCall && expect.shouldNotCall.length > 0) {
      for (const forbidden of expect.shouldNotCall) {
        if (calledNames.has(forbidden)) {
          failures.push(
            `Tool "${forbidden}" NÃO deveria ter sido chamado, mas foi.`,
          );
        }
      }
    }
  }

  private assertMessageContent(
    expect: EvalAssertion,
    response: EvalAgentResponse,
    failures: string[],
  ): void {
    const message = response.finalMessage ?? '';
    const lower = message.toLowerCase();

    if (expect.messageContains && expect.messageContains.length > 0) {
      for (const needle of expect.messageContains) {
        if (!lower.includes(needle.toLowerCase())) {
          failures.push(
            `Mensagem deveria conter "${needle}". Recebido: "${this.truncate(message, 200)}"`,
          );
        }
      }
    }

    if (expect.messageNotContains && expect.messageNotContains.length > 0) {
      for (const forbidden of expect.messageNotContains) {
        if (lower.includes(forbidden.toLowerCase())) {
          failures.push(
            `Mensagem NÃO deveria conter "${forbidden}", mas contém. Recebido: "${this.truncate(message, 200)}"`,
          );
        }
      }
    }
  }

  private assertFinalAction(
    expect: EvalAssertion,
    response: EvalAgentResponse,
    failures: string[],
  ): void {
    if (expect.finalAction && response.finalAction !== expect.finalAction) {
      failures.push(
        `finalAction esperado "${expect.finalAction}", recebido "${response.finalAction}"`,
      );
    }

    if (expect.delegateTo) {
      if (expect.finalAction && expect.finalAction !== 'DELEGATED') {
        // Inconsistência no próprio caso — sinalizamos como falha pra
        // forçar correção do dataset.
        failures.push(
          `delegateTo informado mas finalAction esperado é "${expect.finalAction}" (deveria ser DELEGATED)`,
        );
      }

      // delegateTo é um sub-campo do finalAction DELEGATED. Quando o
      // agent-runner real for plugado, precisaremos expor o destino do
      // delegate na resposta. Por enquanto, fica documentado como TODO:
      // TODO Fase 2: extrair "delegateTo" do agentResponse quando o
      // runner real expuser esse metadado.
    }
  }

  private async assertJudge(
    expect: EvalAssertion,
    response: EvalAgentResponse,
    failures: string[],
  ): Promise<void> {
    if (!expect.judgeQuestion) return;

    const expectedVerdict = expect.judgeMustBe ?? 'pass';
    const verdict = await this.judge.evaluate(
      expect.judgeQuestion,
      response.finalMessage ?? '',
    );

    if (verdict.verdict !== expectedVerdict) {
      failures.push(
        `Judge esperava "${expectedVerdict}" mas retornou "${verdict.verdict}". ` +
          `Razão: ${verdict.reasoning}`,
      );
    }
  }

  private truncate(s: string, max: number): string {
    if (s.length <= max) return s;
    return `${s.slice(0, max)}…`;
  }
}
