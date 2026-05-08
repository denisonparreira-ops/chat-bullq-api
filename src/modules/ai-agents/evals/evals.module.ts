import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmModule } from '../llm/llm.module';
import { EvalRunnerService } from './runner.service';
import { JudgeService } from './judge.service';
import { EvalReporterService } from './reporter.service';
import { EvalsController } from './evals.controller';

/**
 * Sistema de evals (testes automatizados de prompt) dos agents de IA.
 * Roda casos declarativos contra um agent, valida tool calls + conteúdo
 * + final action, e usa um LLM-as-judge (Haiku) para asserções subjetivas.
 *
 * Integração com `agent-runner` em modo dryRun é Fase 2 — por enquanto a
 * invocação do agent é stub.
 */
@Module({
  imports: [ConfigModule, LlmModule],
  controllers: [EvalsController],
  providers: [EvalRunnerService, JudgeService, EvalReporterService],
  exports: [EvalRunnerService, JudgeService, EvalReporterService],
})
export class EvalsModule {}
