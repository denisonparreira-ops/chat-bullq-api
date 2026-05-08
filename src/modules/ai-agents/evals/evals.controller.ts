import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards';
import { EvalRunnerService } from './runner.service';
import { EvalReporterService } from './reporter.service';
import { EvalCase, EvalRunReport } from './types';

interface RunEvalsBody {
  datasetName?: string;
  /**
   * Cases podem ser passados inline para a primeira fase (antes do
   * carregamento de datasets em disco/banco). Quando o sistema de
   * datasets for plugado pelo Agent responsável, esse campo vira
   * opcional e a resolução pelo `datasetName` toma prioridade.
   */
  cases?: EvalCase[];
}

interface RunEvalsResponse {
  report: EvalRunReport;
  reportPath: string;
}

/**
 * Endpoint operacional pra rodar uma suíte de evals contra um agent.
 * Retorna o relatório em memória + o path do markdown gravado em /tmp.
 */
@ApiTags('AI Agents - Evals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('agents/:id/evals')
export class EvalsController {
  constructor(
    private readonly runner: EvalRunnerService,
    private readonly reporter: EvalReporterService,
  ) {}

  @Post('run')
  @ApiOperation({
    summary:
      'Run an eval dataset against the given agent. Returns the markdown report path + structured report.',
  })
  async run(
    @Param('id') agentId: string,
    @Body() body: RunEvalsBody,
  ): Promise<RunEvalsResponse> {
    const datasetName = body?.datasetName ?? 'inline';
    const cases = body?.cases ?? [];

    const results = [];
    for (const c of cases) {
      const result = await this.runner.runCase(c, agentId);
      results.push(result);
    }

    const report = this.reporter.buildReport({
      agentName: agentId,
      datasetName,
      results,
    });
    const reportPath = await this.reporter.writeMarkdown(report);

    return { report, reportPath };
  }
}
