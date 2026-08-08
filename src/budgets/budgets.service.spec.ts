jest.mock('../shared/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () => ({
  WorkOrderStatus: {
    RECEIVED: 'RECEIVED',
    IN_DIAGNOSIS: 'IN_DIAGNOSIS',
    WAITING_APPROVAL: 'WAITING_APPROVAL',
    IN_EXECUTION: 'IN_EXECUTION',
    FINISHED: 'FINISHED',
    DELIVERED: 'DELIVERED',
  },
  BudgetStatus: {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
  },
}));

import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../shared/prisma/prisma.service';
import { BudgetsService } from './budgets.service';

describe('BudgetsService', () => {
  let service: BudgetsService;

  const prismaMock = {
    workOrder: {
      findUnique: jest.fn(),
    },
    budget: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BudgetsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<BudgetsService>(BudgetsService);
  });

  it('deve gerar orçamento com base nos itens da OS', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'WAITING_APPROVAL',
      serviceItems: [
        { subtotal: 100 },
        { subtotal: 50 },
      ],
      partItems: [
        { subtotal: 40 },
      ],
      budget: null,
    });

    prismaMock.budget.create.mockResolvedValue({
      id: 'budget-1',
      workOrderId: 'wo-1',
      servicesTotal: 150,
      partsTotal: 40,
      totalAmount: 190,
      status: 'PENDING',
    });

    const result = await service.generate('wo-1');

    expect(prismaMock.budget.create).toHaveBeenCalled();
    expect(result.totalAmount).toBe(190);
  });

  it('deve recalcular orçamento existente', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'WAITING_APPROVAL',
      serviceItems: [{ subtotal: 80 }],
      partItems: [{ subtotal: 20 }],
      budget: {
        id: 'budget-1',
        workOrderId: 'wo-1',
      },
    });

    prismaMock.budget.update.mockResolvedValue({
      id: 'budget-1',
      workOrderId: 'wo-1',
      servicesTotal: 80,
      partsTotal: 20,
      totalAmount: 100,
      status: 'PENDING',
    });

    const result = await service.generate('wo-1');

    expect(prismaMock.budget.update).toHaveBeenCalled();
    expect(result.totalAmount).toBe(100);
  });

  it('deve rejeitar geração para OS inexistente', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue(null);

    await expect(service.generate('missing-wo')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deve rejeitar geração para OS em execução', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'IN_EXECUTION',
      serviceItems: [],
      partItems: [],
      budget: null,
    });

    await expect(service.generate('wo-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('deve consultar orçamento por workOrderId', async () => {
    prismaMock.budget.findUnique.mockResolvedValue({
      id: 'budget-1',
      workOrderId: 'wo-1',
      status: 'PENDING',
      workOrder: {
        id: 'wo-1',
      },
    });

    const result = await service.findByWorkOrder('wo-1');

    expect(result.id).toBe('budget-1');
  });

  it('deve aprovar orçamento de OS aguardando aprovação', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'WAITING_APPROVAL',
    });

    prismaMock.budget.findUnique.mockResolvedValue({
      id: 'budget-1',
      workOrderId: 'wo-1',
      status: 'PENDING',
    });

    prismaMock.budget.update.mockResolvedValue({
      id: 'budget-1',
      workOrderId: 'wo-1',
      status: 'APPROVED',
    });

    const result = await service.approve('wo-1');

    expect(prismaMock.budget.update).toHaveBeenCalled();
    expect(result.status).toBe('APPROVED');
  });

  it('deve rejeitar aprovação quando OS não está aguardando aprovação', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'RECEIVED',
    });

    await expect(service.approve('wo-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('deve rejeitar orçamento de OS aguardando aprovação', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'WAITING_APPROVAL',
    });

    prismaMock.budget.findUnique.mockResolvedValue({
      id: 'budget-1',
      workOrderId: 'wo-1',
      status: 'PENDING',
    });

    prismaMock.budget.update.mockResolvedValue({
      id: 'budget-1',
      workOrderId: 'wo-1',
      status: 'REJECTED',
    });

    const result = await service.reject('wo-1');

    expect(prismaMock.budget.update).toHaveBeenCalled();
    expect(result.status).toBe('REJECTED');
  });

  it('deve lançar erro ao consultar orçamento inexistente por workOrderId', async () => {
  prismaMock.budget.findUnique.mockResolvedValue(null);

  await expect(service.findByWorkOrder('wo-missing')).rejects.toBeInstanceOf(
    NotFoundException,
  );
});

it('deve retornar orçamento por id', async () => {
  prismaMock.budget.findUnique.mockResolvedValue({
    id: 'budget-1',
    workOrder: {
      id: 'wo-1',
    },
  });

  const result = await service.findOne('budget-1');

  expect(result.id).toBe('budget-1');
});

it('deve lançar erro ao consultar orçamento inexistente por id', async () => {
  prismaMock.budget.findUnique.mockResolvedValue(null);

  await expect(service.findOne('budget-missing')).rejects.toBeInstanceOf(
    NotFoundException,
  );
});

it('deve enviar orçamento quando OS está aguardando aprovação', async () => {
  prismaMock.workOrder.findUnique.mockResolvedValue({
    id: 'wo-1',
    status: 'WAITING_APPROVAL',
  });

  prismaMock.budget.findUnique.mockResolvedValue({
    id: 'budget-1',
    workOrderId: 'wo-1',
    status: 'PENDING',
  });

  prismaMock.budget.update.mockResolvedValue({
    id: 'budget-1',
    workOrderId: 'wo-1',
    status: 'PENDING',
    sentAt: new Date(),
  });

  const result = await service.send('wo-1');

  expect(prismaMock.budget.update).toHaveBeenCalled();
  expect(result.workOrderId).toBe('wo-1');
});

it('deve rejeitar envio quando OS não está aguardando aprovação', async () => {
  prismaMock.workOrder.findUnique.mockResolvedValue({
    id: 'wo-1',
    status: 'RECEIVED',
  });

  await expect(service.send('wo-1')).rejects.toBeInstanceOf(
    BadRequestException,
  );
});

it('deve rejeitar aprovação quando orçamento não existe', async () => {
  prismaMock.workOrder.findUnique.mockResolvedValue({
    id: 'wo-1',
    status: 'WAITING_APPROVAL',
  });

  prismaMock.budget.findUnique.mockResolvedValue(null);

  await expect(service.approve('wo-1')).rejects.toBeInstanceOf(
    NotFoundException,
  );
});

it('deve rejeitar rejeição quando orçamento não existe', async () => {
  prismaMock.workOrder.findUnique.mockResolvedValue({
    id: 'wo-1',
    status: 'WAITING_APPROVAL',
  });

  prismaMock.budget.findUnique.mockResolvedValue(null);

  await expect(service.reject('wo-1')).rejects.toBeInstanceOf(
    NotFoundException,
  );
});
});