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
import { WorkOrdersService } from './work-orders.service';

describe('WorkOrdersService', () => {
  let service: WorkOrdersService;

  const prismaMock = {
    customer: {
      findUnique: jest.fn(),
    },
    vehicle: {
      findUnique: jest.fn(),
    },
    service: {
      findUnique: jest.fn(),
    },
    inventoryItem: {
      findUnique: jest.fn(),
    },
    budget: {
      findUnique: jest.fn(),
    },
    workOrder: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    workOrderServiceItem: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    workOrderPartItem: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<WorkOrdersService>(WorkOrdersService);
  });

  it('deve criar OS quando cliente e veículo são válidos e compatíveis', async () => {
    prismaMock.customer.findUnique.mockResolvedValue({
      id: 'customer-1',
      name: 'Maria',
    });

    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      customerId: 'customer-1',
      plate: 'ABC1D23',
    });

    prismaMock.workOrder.create.mockResolvedValue({
      id: 'wo-1',
      code: 'OS-123',
      customerId: 'customer-1',
      vehicleId: 'vehicle-1',
      status: 'RECEIVED',
    });

    const result = await service.create({
      customerId: 'customer-1',
      vehicleId: 'vehicle-1',
      initialNotes: 'Cliente relatou barulho no motor',
    });

    expect(prismaMock.workOrder.create).toHaveBeenCalled();
    expect(result.status).toBe('RECEIVED');
  });

  it('deve rejeitar criação quando cliente não existe', async () => {
    prismaMock.customer.findUnique.mockResolvedValue(null);

    await expect(
      service.create({
        customerId: 'missing-customer',
        vehicleId: 'vehicle-1',
        initialNotes: 'Teste',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deve rejeitar criação quando veículo não pertence ao cliente', async () => {
    prismaMock.customer.findUnique.mockResolvedValue({
      id: 'customer-1',
      name: 'Maria',
    });

    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      customerId: 'another-customer',
      plate: 'ABC1D23',
    });

    await expect(
      service.create({
        customerId: 'customer-1',
        vehicleId: 'vehicle-1',
        initialNotes: 'Teste',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve listar OS por status', async () => {
    prismaMock.workOrder.findMany.mockResolvedValue([
      { id: 'wo-1', status: 'WAITING_APPROVAL' },
    ]);

    const result = await service.findByStatus('WAITING_APPROVAL' as any);

    expect(result).toHaveLength(1);
  });

  it('deve listar OS por cliente', async () => {
    prismaMock.workOrder.findMany.mockResolvedValue([
      { id: 'wo-1', customerId: 'customer-1' },
    ]);

    const result = await service.findByCustomer('customer-1');

    expect(result).toHaveLength(1);
  });

  it('deve listar OS por veículo', async () => {
    prismaMock.workOrder.findMany.mockResolvedValue([
      { id: 'wo-1', vehicleId: 'vehicle-1' },
    ]);

    const result = await service.findByVehicle('vehicle-1');

    expect(result).toHaveLength(1);
  });

  it('deve adicionar item de serviço à OS editável', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'RECEIVED',
    });

    prismaMock.service.findUnique.mockResolvedValue({
      id: 'service-1',
      name: 'Troca de óleo',
      description: 'Troca de óleo do motor',
      basePrice: 199.9,
      estimatedTimeMinutes: 60,
      isActive: true,
    });

    prismaMock.workOrderServiceItem.create.mockResolvedValue({
      id: 'item-1',
      workOrderId: 'wo-1',
      serviceId: 'service-1',
      quantity: 1,
      subtotal: 199.9,
    });

    const result = await service.addServiceItem('wo-1', {
      serviceId: 'service-1',
      quantity: 1,
      description: 'Troca de óleo',
    });

    expect(prismaMock.workOrderServiceItem.create).toHaveBeenCalled();
    expect(result.subtotal).toBe(199.9);
  });

  it('deve rejeitar item de serviço quando serviço está inativo', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'RECEIVED',
    });

    prismaMock.service.findUnique.mockResolvedValue({
      id: 'service-1',
      isActive: false,
      basePrice: 199.9,
    });

    await expect(
      service.addServiceItem('wo-1', {
        serviceId: 'service-1',
        quantity: 1,
        description: 'Teste',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve atualizar item de serviço da OS', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'RECEIVED',
    });

    prismaMock.workOrderServiceItem.findFirst.mockResolvedValue({
      id: 'item-1',
      workOrderId: 'wo-1',
      serviceId: 'service-1',
      quantity: 1,
      description: 'Troca de óleo',
      service: {
        id: 'service-1',
        basePrice: 199.9,
        estimatedTimeMinutes: 60,
        isActive: true,
      },
    });

    prismaMock.workOrderServiceItem.update.mockResolvedValue({
      id: 'item-1',
      quantity: 2,
      subtotal: 399.8,
    });

    const result = await service.updateServiceItem('wo-1', 'item-1', {
      quantity: 2,
    });

    expect(prismaMock.workOrderServiceItem.update).toHaveBeenCalled();
    expect(result.subtotal).toBe(399.8);
  });

  it('deve remover item de serviço da OS', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'RECEIVED',
    });

    prismaMock.workOrderServiceItem.findFirst.mockResolvedValue({
      id: 'item-1',
      workOrderId: 'wo-1',
    });

    prismaMock.workOrderServiceItem.delete.mockResolvedValue(undefined);

    const result = await service.removeServiceItem('wo-1', 'item-1');

    expect(prismaMock.workOrderServiceItem.delete).toHaveBeenCalled();
    expect(result.message).toContain('removido');
  });

  it('deve adicionar item de peça/insumo à OS editável', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'RECEIVED',
    });

    prismaMock.inventoryItem.findUnique.mockResolvedValue({
      id: 'inventory-1',
      name: 'Óleo 5W30',
      itemType: 'SUPPLY',
      unitPrice: 49.9,
      isActive: true,
    });

    prismaMock.workOrderPartItem.create.mockResolvedValue({
      id: 'part-1',
      workOrderId: 'wo-1',
      inventoryItemId: 'inventory-1',
      plannedQuantity: 2,
      subtotal: 99.8,
    });

    const result = await service.addPartItem('wo-1', {
      inventoryItemId: 'inventory-1',
      plannedQuantity: 2,
      notes: 'Previsto para execução',
    });

    expect(prismaMock.workOrderPartItem.create).toHaveBeenCalled();
    expect(result.subtotal).toBe(99.8);
  });

  it('deve atualizar item de peça/insumo da OS', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'RECEIVED',
    });

    prismaMock.workOrderPartItem.findFirst.mockResolvedValue({
      id: 'part-1',
      workOrderId: 'wo-1',
      plannedQuantity: 2,
      inventoryItem: {
        id: 'inventory-1',
        itemType: 'SUPPLY',
        unitPrice: 49.9,
        isActive: true,
      },
    });

    prismaMock.workOrderPartItem.update.mockResolvedValue({
      id: 'part-1',
      plannedQuantity: 3,
      subtotal: 149.7,
    });

    const result = await service.updatePartItem('wo-1', 'part-1', {
      plannedQuantity: 3,
    });

    expect(prismaMock.workOrderPartItem.update).toHaveBeenCalled();
    expect(result.subtotal).toBe(149.7);
  });

  it('deve remover item de peça/insumo da OS', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'RECEIVED',
    });

    prismaMock.workOrderPartItem.findFirst.mockResolvedValue({
      id: 'part-1',
      workOrderId: 'wo-1',
    });

    prismaMock.workOrderPartItem.delete.mockResolvedValue(undefined);

    const result = await service.removePartItem('wo-1', 'part-1');

    expect(prismaMock.workOrderPartItem.delete).toHaveBeenCalled();
    expect(result.message).toContain('removido');
  });

  it('deve impedir edição de itens quando OS já está em execução', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'IN_EXECUTION',
    });

    await expect(
      service.addPartItem('wo-1', {
        inventoryItemId: 'inventory-1',
        plannedQuantity: 2,
        notes: 'Teste',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve iniciar diagnóstico apenas para OS recebida', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'RECEIVED',
    });

    prismaMock.workOrder.update.mockResolvedValue({
      id: 'wo-1',
      status: 'IN_DIAGNOSIS',
    });

    const result = await service.startDiagnosis('wo-1');

    expect(prismaMock.workOrder.update).toHaveBeenCalled();
    expect(result.status).toBe('IN_DIAGNOSIS');
  });

  it('deve rejeitar início de diagnóstico fora de RECEIVED', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'WAITING_APPROVAL',
    });

    await expect(service.startDiagnosis('wo-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('deve mover OS para aguardando aprovação a partir de diagnóstico', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'IN_DIAGNOSIS',
    });

    prismaMock.workOrder.update.mockResolvedValue({
      id: 'wo-1',
      status: 'WAITING_APPROVAL',
    });

    const result = await service.moveToAwaitingApproval('wo-1');

    expect(prismaMock.workOrder.update).toHaveBeenCalled();
    expect(result.status).toBe('WAITING_APPROVAL');
  });

  it('deve impedir início da execução sem orçamento aprovado', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'WAITING_APPROVAL',
    });

    prismaMock.budget.findUnique.mockResolvedValue({
      id: 'budget-1',
      workOrderId: 'wo-1',
      status: 'PENDING',
    });

    await expect(service.startExecution('wo-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('deve iniciar execução com orçamento aprovado', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'WAITING_APPROVAL',
    });

    prismaMock.budget.findUnique.mockResolvedValue({
      id: 'budget-1',
      workOrderId: 'wo-1',
      status: 'APPROVED',
    });

    prismaMock.workOrder.update.mockResolvedValue({
      id: 'wo-1',
      status: 'IN_EXECUTION',
    });

    const result = await service.startExecution('wo-1');

    expect(prismaMock.workOrder.update).toHaveBeenCalled();
    expect(result.status).toBe('IN_EXECUTION');
  });

  it('deve finalizar OS em execução', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'IN_EXECUTION',
    });

    prismaMock.workOrder.update.mockResolvedValue({
      id: 'wo-1',
      status: 'FINISHED',
    });

    const result = await service.finish('wo-1');

    expect(prismaMock.workOrder.update).toHaveBeenCalled();
    expect(result.status).toBe('FINISHED');
  });

  it('deve entregar OS finalizada', async () => {
    prismaMock.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'FINISHED',
    });

    prismaMock.workOrder.update.mockResolvedValue({
      id: 'wo-1',
      status: 'DELIVERED',
    });

    const result = await service.deliver('wo-1');

    expect(prismaMock.workOrder.update).toHaveBeenCalled();
    expect(result.status).toBe('DELIVERED');
  });

  it('deve retornar tracking da OS para o cliente', async () => {
    prismaMock.workOrder.findFirst.mockResolvedValue({
      id: 'wo-1',
      code: 'OS-123',
      status: 'WAITING_APPROVAL',
      openedAt: new Date(),
      diagnosisStartedAt: new Date(),
      executionStartedAt: null,
      finishedAt: null,
      deliveredAt: null,
      initialNotes: 'Cliente relatou barulho',
      customer: {
        name: 'Maria',
        documentType: 'CPF',
        document: '52998224725',
      },
      vehicle: {
        plate: 'ABC1D23',
        brand: 'Toyota',
        model: 'Corolla',
        year: 2022,
      },
      budget: {
        status: 'PENDING',
        servicesTotal: 0,
        partsTotal: 99.8,
        totalAmount: 99.8,
        sentAt: null,
        approvedAt: null,
        rejectedAt: null,
      },
    });

    const result = await service.getClientTracking(
      'OS-123',
      '529.982.247-25',
    );

    expect(result.code).toBe('OS-123');
    expect(result.status).toBe('WAITING_APPROVAL');
    expect(result.customer.name).toBe('Maria');
    expect(result.vehicle.plate).toBe('ABC1D23');
  });

  it('deve lançar erro quando tracking não encontra OS', async () => {
    prismaMock.workOrder.findFirst.mockResolvedValue(null);

    await expect(
      service.getClientTracking('OS-123', '52998224725'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deve listar todas as ordens de serviço', async () => {
  prismaMock.workOrder.findMany.mockResolvedValue([
    { id: 'wo-1' },
    { id: 'wo-2' },
  ]);

  const result = await service.findAll();

  expect(result).toHaveLength(2);
});

it('deve retornar OS por id', async () => {
  prismaMock.workOrder.findUnique.mockResolvedValue({
    id: 'wo-1',
    status: 'RECEIVED',
  });

  const result = await service.findOne('wo-1');

  expect(result.id).toBe('wo-1');
});

it('deve lançar erro ao buscar OS inexistente', async () => {
  prismaMock.workOrder.findUnique.mockResolvedValue(null);

  await expect(service.findOne('missing-wo')).rejects.toBeInstanceOf(
    NotFoundException,
  );
});

it('deve rejeitar update de item de serviço quando item não existe', async () => {
  prismaMock.workOrder.findUnique.mockResolvedValue({
    id: 'wo-1',
    status: 'RECEIVED',
  });

  prismaMock.workOrderServiceItem.findFirst.mockResolvedValue(null);

  await expect(
    service.updateServiceItem('wo-1', 'item-missing', {
      quantity: 2,
    }),
  ).rejects.toBeInstanceOf(NotFoundException);
});

it('deve rejeitar update de item de serviço para serviço inativo', async () => {
  prismaMock.workOrder.findUnique.mockResolvedValue({
    id: 'wo-1',
    status: 'RECEIVED',
  });

  prismaMock.workOrderServiceItem.findFirst.mockResolvedValue({
    id: 'item-1',
    workOrderId: 'wo-1',
    serviceId: 'service-1',
    quantity: 1,
    description: 'Troca de óleo',
    service: {
      id: 'service-1',
      basePrice: 199.9,
      estimatedTimeMinutes: 60,
      isActive: true,
    },
  });

  prismaMock.service.findUnique.mockResolvedValue({
    id: 'service-2',
    basePrice: 250,
    estimatedTimeMinutes: 90,
    isActive: false,
  });

  await expect(
    service.updateServiceItem('wo-1', 'item-1', {
      serviceId: 'service-2',
    }),
  ).rejects.toBeInstanceOf(BadRequestException);
});

it('deve rejeitar remoção de item de serviço inexistente', async () => {
  prismaMock.workOrder.findUnique.mockResolvedValue({
    id: 'wo-1',
    status: 'RECEIVED',
  });

  prismaMock.workOrderServiceItem.findFirst.mockResolvedValue(null);

  await expect(
    service.removeServiceItem('wo-1', 'item-missing'),
  ).rejects.toBeInstanceOf(NotFoundException);
});

it('deve rejeitar update de item de peça quando item não existe', async () => {
  prismaMock.workOrder.findUnique.mockResolvedValue({
    id: 'wo-1',
    status: 'RECEIVED',
  });

  prismaMock.workOrderPartItem.findFirst.mockResolvedValue(null);

  await expect(
    service.updatePartItem('wo-1', 'part-missing', {
      plannedQuantity: 3,
    }),
  ).rejects.toBeInstanceOf(NotFoundException);
});

it('deve rejeitar update de item de peça para item de estoque inativo', async () => {
  prismaMock.workOrder.findUnique.mockResolvedValue({
    id: 'wo-1',
    status: 'RECEIVED',
  });

  prismaMock.workOrderPartItem.findFirst.mockResolvedValue({
    id: 'part-1',
    workOrderId: 'wo-1',
    plannedQuantity: 2,
    inventoryItem: {
      id: 'inventory-1',
      itemType: 'SUPPLY',
      unitPrice: 49.9,
      isActive: true,
    },
  });

  prismaMock.inventoryItem.findUnique.mockResolvedValue({
    id: 'inventory-2',
    itemType: 'PART',
    unitPrice: 80,
    isActive: false,
  });

  await expect(
    service.updatePartItem('wo-1', 'part-1', {
      inventoryItemId: 'inventory-2',
    }),
  ).rejects.toBeInstanceOf(BadRequestException);
});

it('deve rejeitar remoção de item de peça inexistente', async () => {
  prismaMock.workOrder.findUnique.mockResolvedValue({
    id: 'wo-1',
    status: 'RECEIVED',
  });

  prismaMock.workOrderPartItem.findFirst.mockResolvedValue(null);

  await expect(
    service.removePartItem('wo-1', 'part-missing'),
  ).rejects.toBeInstanceOf(NotFoundException);
});

it('deve rejeitar transição para aguardando aprovação fora de diagnóstico', async () => {
  prismaMock.workOrder.findUnique.mockResolvedValue({
    id: 'wo-1',
    status: 'RECEIVED',
  });

  await expect(
    service.moveToAwaitingApproval('wo-1'),
  ).rejects.toBeInstanceOf(BadRequestException);
});

it('deve rejeitar início da execução quando não existe orçamento', async () => {
  prismaMock.workOrder.findUnique.mockResolvedValue({
    id: 'wo-1',
    status: 'WAITING_APPROVAL',
  });

  prismaMock.budget.findUnique.mockResolvedValue(null);

  await expect(service.startExecution('wo-1')).rejects.toBeInstanceOf(
    BadRequestException,
  );
});

it('deve rejeitar finalização fora de execução', async () => {
  prismaMock.workOrder.findUnique.mockResolvedValue({
    id: 'wo-1',
    status: 'WAITING_APPROVAL',
  });

  await expect(service.finish('wo-1')).rejects.toBeInstanceOf(
    BadRequestException,
  );
});

it('deve rejeitar entrega fora de finalizada', async () => {
  prismaMock.workOrder.findUnique.mockResolvedValue({
    id: 'wo-1',
    status: 'IN_EXECUTION',
  });

  await expect(service.deliver('wo-1')).rejects.toBeInstanceOf(
    BadRequestException,
  );
});
});