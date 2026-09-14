# tech-challenge-fase3-app — Aplicação Principal (API de Ordens de Serviço)

API RESTful da oficina mecânica (clientes, veículos, serviços, estoque, ordens de serviço e orçamentos), executada em **Kubernetes (Amazon EKS)**. É o quarto componente da arquitetura da Fase 3.

> Parte do Tech Challenge FIAP – Fase 3. Repositórios relacionados: `tech-challenge-fase3-serverless-auth`, `tech-challenge-fase3-infra-k8s`, `tech-challenge-fase3-infra-db`.

## Propósito

Expor as APIs de negócio da oficina, com **rotas protegidas por JWT**. O token é emitido pela função serverless de autenticação (repositório `serverless-auth`) a partir do CPF do cliente e aceito por esta aplicação por compartilharem o mesmo `JWT_SECRET`.

## Tecnologias

- **Node.js 22** + **NestJS 11** (arquitetura hexagonal)
- **Prisma 7** (ORM) com driver adapter **PostgreSQL** (`@prisma/adapter-pg`)
- **Docker** (imagem multi-stage) · **Kubernetes** (Deployment, Service, Secret, HPA)
- **Observabilidade:** `dd-trace` (Datadog APM) + `nestjs-pino` (logs JSON com `trace_id`)
- **Swagger** (documentação das APIs)

## Pré-requisitos

- Node.js 22 e npm
- Docker e Docker Compose (execução local)
- `kubectl` e credenciais AWS (deploy no EKS)
- Um PostgreSQL acessível (local via Docker Compose, ou o RDS em nuvem)

## Execução local

```bash
# sobe banco + aplicação
docker compose up --build
# API em http://localhost:3000/api  · Swagger em http://localhost:3000/docs
```

Migrações do banco (Prisma):

```bash
npx prisma migrate deploy --schema prisma/schema.prisma
```

## Deploy (Kubernetes / EKS)

O deploy é feito pela pipeline, mas pode ser reproduzido manualmente:

```bash
aws eks update-kubeconfig --region us-east-1 --name oficina-eks-cluster-v2
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
kubectl get pods
```

Os manifestos Kubernetes ficam em `k8s/`. A migração do banco roda em um **initContainer** antes da aplicação subir.

## Pipeline de CI/CD (GitHub Actions — `.github/workflows/deploy.yml`)

Fluxo em dois jobs, disparado no merge para `main` (branch protegida, alterações via Pull Request):

1. **test** — `npm ci`, `prisma generate` e `npm test` (testes automatizados).
2. **build-and-deploy** — configura credenciais AWS → login no **ECR** → **build e push** da imagem Docker → `kubectl apply` dos manifestos → `kubectl set image` + `rollout status` (deploy no EKS).

Secrets necessários no repositório: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`.

## Arquitetura do componente

```mermaid
flowchart LR
    GW[API Gateway] -->|/{proxy+}| SVC[Service LoadBalancer]
    SVC --> P1[Pod NestJS]
    SVC --> P2[Pod NestJS]
    HPA[HPA 2..5 CPU 70%] -. escala .-> P1
    P1 -->|Prisma| DB[(RDS PostgreSQL)]
    P1 -. dd-trace/pino .-> DD[Datadog]
    ECR[(ECR)] --> P1
```

## Documentação das APIs

- **Swagger UI:** `http://<endpoint>/docs` (endpoint do API Gateway ou do Load Balancer do EKS).
- Coleção Postman: _<inserir link, se aplicável>_.

## Documentação de arquitetura

Diagramas, RFCs, ADRs e modelo de dados: ver a pasta `docs/` (diagrama de componentes, diagramas de sequência, modelo ER e decisões técnicas).
