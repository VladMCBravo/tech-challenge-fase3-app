import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BudgetStatus, WorkOrderStatus } from '../generated/prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(workOrderId: string) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        serviceItems: true,
        partItems: true,
        budget: true,
      },
    });

    if (!workOrder) {
      throw new NotFoundException('Ordem de serviço não encontrada.');
    }

    if (
      workOrder.status === WorkOrderStatus.IN_EXECUTION ||
      workOrder.status === WorkOrderStatus.FINISHED ||
      workOrder.status === WorkOrderStatus.DELIVERED
    ) {
      throw new BadRequestException(
        'Não é permitido gerar orçamento para uma OS já em execução, finalizada ou entregue.',
      );
    }

    const servicesTotal = workOrder.serviceItems.reduce(
      (sum, item) => sum + Number(item.subtotal),
      0,
    );

    const partsTotal = workOrder.partItems.reduce(
      (sum, item) => sum + Number(item.subtotal),
      0,
    );

    const totalAmount = servicesTotal + partsTotal;

    if (workOrder.budget) {
      return this.prisma.budget.update({
        where: {
          workOrderId,
        },
        data: {
          servicesTotal,
          partsTotal,
          totalAmount,
          status: BudgetStatus.PENDING,
          generatedAt: new Date(),
          sentAt: null,
          approvedAt: null,
          rejectedAt: null,
        },
        include: {
          workOrder: true,
        },
      });
    }

    return this.prisma.budget.create({
      data: {
        workOrderId,
        servicesTotal,
        partsTotal,
        totalAmount,
        status: BudgetStatus.PENDING,
      },
      include: {
        workOrder: true,
      },
    });
  }

  async findByWorkOrder(workOrderId: string) {
    const budget = await this.prisma.budget.findUnique({
      where: {
        workOrderId,
      },
      include: {
        workOrder: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                documentType: true,
                document: true,
              },
            },
            vehicle: {
              select: {
                id: true,
                plate: true,
                brand: true,
                model: true,
                year: true,
              },
            },
            serviceItems: {
              include: {
                service: true,
              },
            },
            partItems: {
              include: {
                inventoryItem: true,
              },
            },
          },
        },
      },
    });

    if (!budget) {
      throw new NotFoundException('Orçamento não encontrado para esta OS.');
    }

    return budget;
  }

  async findOne(id: string) {
    const budget = await this.prisma.budget.findUnique({
      where: { id },
      include: {
        workOrder: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                documentType: true,
                document: true,
              },
            },
            vehicle: {
              select: {
                id: true,
                plate: true,
                brand: true,
                model: true,
                year: true,
              },
            },
          },
        },
      },
    });

    if (!budget) {
      throw new NotFoundException('Orçamento não encontrado.');
    }

    return budget;
  }

  async send(workOrderId: string) {
    const workOrder = await this.ensureWorkOrderExists(workOrderId);

    if (workOrder.status !== WorkOrderStatus.WAITING_APPROVAL) {
      throw new BadRequestException(
        'Só é possível enviar orçamento quando a OS estiver aguardando aprovação.',
      );
    }

    const budget = await this.ensureBudgetExists(workOrderId);

    return this.prisma.budget.update({
      where: {
        workOrderId,
      },
      data: {
        status: BudgetStatus.PENDING,
        sentAt: new Date(),
      },
      include: {
        workOrder: true,
      },
    });
  }

  async approve(workOrderId: string) {
    const workOrder = await this.ensureWorkOrderExists(workOrderId);

    if (workOrder.status !== WorkOrderStatus.WAITING_APPROVAL) {
      throw new BadRequestException(
        'Só é possível aprovar orçamento quando a OS estiver aguardando aprovação.',
      );
    }

    await this.ensureBudgetExists(workOrderId);

    return this.prisma.budget.update({
      where: {
        workOrderId,
      },
      data: {
        status: BudgetStatus.APPROVED,
        approvedAt: new Date(),
        rejectedAt: null,
      },
      include: {
        workOrder: true,
      },
    });
  }

  async reject(workOrderId: string) {
    const workOrder = await this.ensureWorkOrderExists(workOrderId);

    if (workOrder.status !== WorkOrderStatus.WAITING_APPROVAL) {
      throw new BadRequestException(
        'Só é possível rejeitar orçamento quando a OS estiver aguardando aprovação.',
      );
    }

    await this.ensureBudgetExists(workOrderId);

    return this.prisma.budget.update({
      where: {
        workOrderId,
      },
      data: {
        status: BudgetStatus.REJECTED,
        rejectedAt: new Date(),
        approvedAt: null,
      },
      include: {
        workOrder: true,
      },
    });
  }

  private async ensureWorkOrderExists(workOrderId: string) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
    });

    if (!workOrder) {
      throw new NotFoundException('Ordem de serviço não encontrada.');
    }

    return workOrder;
  }

  private async ensureBudgetExists(workOrderId: string) {
    const budget = await this.prisma.budget.findUnique({
      where: {
        workOrderId,
      },
    });

    if (!budget) {
      throw new NotFoundException('Orçamento não encontrado para esta OS.');
    }

    return budget;
  }
}