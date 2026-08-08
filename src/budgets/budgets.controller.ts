import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BudgetsService } from './budgets.service';

@ApiTags('Budgets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Post('work-orders/:id/budget/generate')
  @ApiOperation({ summary: 'Gera ou recalcula o orçamento da OS' })
  generate(@Param('id') workOrderId: string) {
    return this.budgetsService.generate(workOrderId);
  }

  @Get('work-orders/:id/budget')
  @ApiOperation({ summary: 'Consulta o orçamento da OS' })
  findByWorkOrder(@Param('id') workOrderId: string) {
    return this.budgetsService.findByWorkOrder(workOrderId);
  }

  @Post('work-orders/:id/budget/send')
  @ApiOperation({ summary: 'Envia o orçamento para aprovação' })
  send(@Param('id') workOrderId: string) {
    return this.budgetsService.send(workOrderId);
  }

  @Post('work-orders/:id/budget/approve')
  @ApiOperation({ summary: 'Aprova o orçamento da OS' })
  approve(@Param('id') workOrderId: string) {
    return this.budgetsService.approve(workOrderId);
  }

  @Post('work-orders/:id/budget/reject')
  @ApiOperation({ summary: 'Rejeita o orçamento da OS' })
  reject(@Param('id') workOrderId: string) {
    return this.budgetsService.reject(workOrderId);
  }

  @Get('budgets/:id')
  @ApiOperation({ summary: 'Busca um orçamento por ID' })
  findOne(@Param('id') id: string) {
    return this.budgetsService.findOne(id);
  }
}