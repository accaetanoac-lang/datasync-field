# DataSync Field — Especificação Completa do Sistema

## Visão Geral

Sistema para gestão de coleta de dados de máquinas agrícolas John Deere desconectadas.
Técnicos de campo usam o app mobile para registrar visitas e coletar dados.
O admin centraliza indicadores, relatórios e o BI de conectividade conforme indicador 18
(Adoção e Utilização de Tecnologias) da John Deere.

\---

## Estrutura do Monorepo

```
datasync-field/
├── api/           Node.js + Express + TypeScript
├── mobile/        React Native + Expo + TypeScript
├── admin/         Next.js + TypeScript
└── .github/
    └── workflows/
```

\---

## Fonte de Dados — Três Planilhas Mensais

O sistema é alimentado mensalmente por três arquivos Excel exportados do John Deere Operations Center.
O admin possui uma tela de upload onde o gestor carrega os três arquivos de uma vez.
Após o upload, a API processa e faz upsert no banco PostgreSQL (AWS RDS).

### Planilha 1 — `mlc-ultima-conexao-maquina.xlsx`

**Aba Sheet 1** (409 linhas, 8 colunas):

|Coluna|Uso no sistema|
|-|-|
|`Pin`|Número de série/chassi da máquina (chave primária)|
|`Org id`|ID da organização/fazenda|
|`Last Called In Date`|Data da última conexão (base para calcular dias offline)|
|`Machine Hour In Period`|Horímetro registrado na última conexão|
|`Last Known Lat`|Latitude da última posição conhecida da máquina|
|`Last Known Long`|Longitude da última posição conhecida da máquina|
|`Last Called In`|Faixa de dias offline: `16 to 60 days`, `61 to 365 days`, `365+ days`|

**Aba Organização** (149 linhas):

|Coluna|Uso|
|-|-|
|`Org Id`|Chave de join com Sheet 1|
|`Org Name`|Nome da fazenda/organização exibido no app e admin|

> \*\*Regra crítica:\*\* toda máquina com `Last Called In Date` há 30 dias ou mais (ou nula) entra
> na fila de coleta. A faixa `16 to 60 days` já inclui máquinas a partir de 16 dias —
> o sistema deve filtrar apenas as ≥ 30 dias calculando a diferença real em dias a partir de
> `Last Called In Date` e da data de upload da planilha.

\---

### Planilha 2 — `cde-saude-do-cliente.xlsx`

**40 colunas, 158 organizações.** Dados de saúde digital do cliente no Operations Center.

Campos usados no BI:

|Coluna|Indicador gerado|
|-|-|
|`Org ID` / `Org Name`|Join com outras planilhas|
|`Engagement Level`|Nível de engajamento: `Highly Engaged Retained`, `R12 Digitally Engaged`, `Highly Engaged`, `Land \& Digital`|
|`All Modems`|Total de modems JDLink na organização|
|`Non-Active JDLink Modems`|Modems inativos|
|`Lg Ag Mach JDLink Modems`|Máquinas grandes com modem|
|`Lg Ag Not Submitting Agronomic Data`|Máquinas conectadas mas sem enviar dados agronômicos|
|`Lg Ag Connected Mach Gen4/G5`|Máquinas com monitor Gen4/G5 conectadas|
|`Risk Acres`|Hectares em risco (não engajados)|
|`Highly Engaged Acres`|Hectares altamente engajados|
|`VCA - Setup File`|Ação de valor: arquivo de configuração (Y/N)|
|`VCA - Work Plan`|Ação de valor: plano de trabalho (Y/N)|
|`VCA - Field / Line / Boundary / Flag`|Ação de valor: campo/linha/divisas (Y/N)|
|`VCA - Equipment Monitoring`|Ação de valor: monitoramento de equipamento (Y/N)|
|`VCA - Work Details or Map`|Ação de valor: detalhes de trabalho/mapa (Y/N)|
|`VCA - Agronomic or Machine Reports`|Ação de valor: relatórios agronômicos (Y/N)|
|`Média de R12 Value Creating Actions`|Média de ações de valor nos últimos 12 meses|
|`Last Login Ops Center Web`|Último acesso web ao Operations Center|
|`Last Login Ops Center Mobile`|Último acesso mobile ao Operations Center|
|`Work Plans Created (R12)`|Planos de trabalho criados em 12 meses|
|`Work Plans Completed (R12)`|Planos de trabalho concluídos em 12 meses|
|`Fields without Boundaries`|Campos sem divisas definidas|
|`Prepare Acres` / `Plant Acres` / `Apply Acres` / `Harvest Acres`|Hectares por operação agrícola|

\---

### Planilha 3 — `gap-comportamento-hareas-conectadas.xlsx`

**23 colunas, 149 organizações.** GAP entre hectares máximos possíveis e YTD realizados.

Campos usados no BI:

|Coluna|Indicador gerado|
|-|-|
|`Org Id` / `Org Name`|Join com outras planilhas|
|`Máx. EH` / `YTD HE` / `Gap EH`|Hectares engajados: máx, realizado, gap|
|`Máx. HEH` / `YTD HEH` / `GAP HEH`|Hectares altamente engajados: máx, realizado, gap|
|`Máx. Prepare` / `YTD Prepare` / `GAP Prepare`|Operação preparo de solo|
|`Máx. Plant` / `YTD Plant` / `GAP Plant`|Operação plantio|
|`Máx. Apply` / `YTD Apply` / `Gap Apply`|Operação aplicação|
|`Max Harvest` / `YTD Harvest` / `Gap Harvest`|Operação colheita|

\---

## Banco de Dados — Schema PostgreSQL (AWS RDS)

```sql
-- Organizações/fazendas
CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  org\_id\_jd VARCHAR(20) UNIQUE NOT NULL,  -- ID do Operations Center
  name VARCHAR(200) NOT NULL,
  zip\_code VARCHAR(20),
  org\_type VARCHAR(50),
  org\_sub\_type VARCHAR(50),
  engagement\_level VARCHAR(50),
  created\_at TIMESTAMP DEFAULT NOW(),
  updated\_at TIMESTAMP DEFAULT NOW()
);

-- Máquinas
CREATE TABLE machines (
  id SERIAL PRIMARY KEY,
  pin VARCHAR(30) UNIQUE,                  -- Chassi JD (nulo para máquinas não-JD)
  org\_id INTEGER REFERENCES organizations(id),
  is\_john\_deere BOOLEAN DEFAULT TRUE,
  custom\_name VARCHAR(100),               -- Para máquinas não-JD
  custom\_description VARCHAR(200),        -- Para máquinas não-JD
  last\_call\_date DATE,
  machine\_hours DECIMAL(10,2),           -- Horímetro na última conexão
  last\_known\_lat DECIMAL(10,6),
  last\_known\_lng DECIMAL(10,6),
  days\_offline INTEGER,                   -- Calculado no upload
  offline\_range VARCHAR(20),             -- '16 to 60 days', '61 to 365 days', '365+ days'
  created\_at TIMESTAMP DEFAULT NOW(),
  updated\_at TIMESTAMP DEFAULT NOW()
);

-- Saúde do cliente (CDE)
CREATE TABLE customer\_health (
  id SERIAL PRIMARY KEY,
  org\_id INTEGER REFERENCES organizations(id),
  upload\_month DATE NOT NULL,            -- Mês de referência da planilha
  all\_modems INTEGER,
  non\_active\_modems INTEGER,
  lg\_ag\_modems INTEGER,
  lg\_ag\_not\_submitting INTEGER,
  lg\_ag\_connected\_gen45 INTEGER,
  risk\_acres DECIMAL(12,2),
  highly\_engaged\_acres DECIMAL(12,2),
  prepare\_acres DECIMAL(12,2),
  plant\_acres DECIMAL(12,2),
  apply\_acres DECIMAL(12,2),
  harvest\_acres DECIMAL(12,2),
  vca\_setup\_file BOOLEAN,
  vca\_work\_plan BOOLEAN,
  vca\_field\_boundary BOOLEAN,
  vca\_equipment\_monitoring BOOLEAN,
  vca\_work\_details BOOLEAN,
  vca\_agronomic\_reports BOOLEAN,
  r12\_vca\_avg DECIMAL(5,2),
  work\_plans\_created INTEGER,
  work\_plans\_completed INTEGER,
  fields\_without\_boundaries INTEGER,
  last\_login\_web VARCHAR(20),
  last\_login\_mobile VARCHAR(20),
  created\_at TIMESTAMP DEFAULT NOW()
);

-- GAP de hectares conectadas
CREATE TABLE hectares\_gap (
  id SERIAL PRIMARY KEY,
  org\_id INTEGER REFERENCES organizations(id),
  upload\_month DATE NOT NULL,
  max\_eh DECIMAL(12,2),
  ytd\_he DECIMAL(12,2),
  gap\_eh DECIMAL(12,2),
  max\_heh DECIMAL(12,2),
  ytd\_heh DECIMAL(12,2),
  gap\_heh DECIMAL(12,2),
  max\_prepare DECIMAL(12,2), ytd\_prepare DECIMAL(12,2), gap\_prepare DECIMAL(12,2),
  max\_plant DECIMAL(12,2),   ytd\_plant DECIMAL(12,2),   gap\_plant DECIMAL(12,2),
  max\_apply DECIMAL(12,2),   ytd\_apply DECIMAL(12,2),   gap\_apply DECIMAL(12,2),
  max\_harvest DECIMAL(12,2), ytd\_harvest DECIMAL(12,2), gap\_harvest DECIMAL(12,2),
  created\_at TIMESTAMP DEFAULT NOW()
);

-- Técnicos de campo
CREATE TABLE technicians (
  id SERIAL PRIMARY KEY,
  employee\_id VARCHAR(7) UNIQUE NOT NULL,  -- formato x000000
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100),
  role VARCHAR(20) NOT NULL DEFAULT 'technician', -- 'admin' | 'technician'
  active BOOLEAN DEFAULT TRUE,
  created\_at TIMESTAMP DEFAULT NOW()
);

-- Atividades de coleta
CREATE TABLE activities (
  id SERIAL PRIMARY KEY,
  technician\_id INTEGER REFERENCES technicians(id),
  machine\_id INTEGER REFERENCES machines(id),
  org\_id INTEGER REFERENCES organizations(id),
  method VARCHAR(20) NOT NULL,           -- 'starlink\_data\_sync' | 'pen\_drive'
  status VARCHAR(20) DEFAULT 'in\_progress', -- 'in\_progress' | 'completed' | 'no\_use'
  current\_hours DECIMAL(10,2),          -- Horímetro informado pelo técnico no campo
  hours\_diff DECIMAL(10,2),             -- Diferença entre current\_hours e machine\_hours
  tech\_lat DECIMAL(10,6),               -- Geolocalização do técnico no início
  tech\_lng DECIMAL(10,6),
  started\_at TIMESTAMP,
  finished\_at TIMESTAMP,
  duration\_minutes INTEGER,             -- Calculado ao finalizar
  notes TEXT,
  synced\_offline BOOLEAN DEFAULT FALSE, -- TRUE se foi registrado offline e sincronizado depois
  created\_at TIMESTAMP DEFAULT NOW()
);

-- Registro de uploads mensais
CREATE TABLE excel\_uploads (
  id SERIAL PRIMARY KEY,
  uploaded\_by INTEGER REFERENCES technicians(id),
  reference\_month DATE NOT NULL,
  file\_mlc\_path VARCHAR(300),
  file\_cde\_path VARCHAR(300),
  file\_gap\_path VARCHAR(300),
  machines\_processed INTEGER,
  orgs\_processed INTEGER,
  processed\_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'processing' -- 'processing' | 'done' | 'error'
);

-- Log de presença do técnico em fazendas sem coleta
CREATE TABLE field\_visits\_no\_collection (
  id SERIAL PRIMARY KEY,
  technician\_id INTEGER REFERENCES technicians(id),
  org\_id INTEGER REFERENCES organizations(id),
  visit\_lat DECIMAL(10,6),
  visit\_lng DECIMAL(10,6),
  detected\_at TIMESTAMP,
  machines\_pending INTEGER,             -- Quantas máquinas offline havia nesse momento
  created\_at TIMESTAMP DEFAULT NOW()
);
```

\---

## API — Endpoints (Node.js + Express + TypeScript)

### Autenticação

* O sistema usa autenticação própria baseada no **ID do funcionário** (`x000000`)
* O admin cadastra os funcionários com nome, ID e role (`admin` | `technician`)
* A API valida o ID e retorna um JWT assinado internamente (sem AWS Cognito)
* O JWT é salvo no AsyncStorage do mobile para uso offline
* Rotas protegidas verificam o JWT no header `Authorization: Bearer <token>`

### Endpoints

```
POST   /auth/login                    Recebe { employee\_id: 'x000000' }, valida no banco, retorna JWT
POST   /auth/refresh                  Refresh do JWT

GET    /orgs?search=<nome>            Busca organizações por nome (autocomplete)
GET    /orgs/:id                      Detalhes de uma organização
GET    /orgs/:id/machines             Máquinas offline >= 30 dias da organização

GET    /machines/:pin                 Detalhes de uma máquina por chassi
POST   /machines/non-jd               Cadastrar máquina não-John Deere

POST   /activities                    Iniciar atividade (recebe org\_id, machine\_id, method, current\_hours, tech\_lat, tech\_lng)
PUT    /activities/:id/finish         Finalizar atividade (calcula duration\_minutes)
PUT    /activities/:id/no-use         Marcar como "sem uso" (diff < 50h)
GET    /activities                    Listar atividades (admin) com filtros: tech\_id, org\_id, date\_from, date\_to

POST   /upload                        Upload dos 3 xlsx (multipart/form-data)
                                      Campos: file\_mlc, file\_cde, file\_gap, reference\_month
                                      Processa com xlsx.js e faz upsert no banco

GET    /reports/summary               Resumo geral: total máquinas, % offline, hectares em risco
GET    /reports/technicians           Horas por técnico no período
GET    /reports/organizations         Status por organização
GET    /reports/bi                    Dados completos para o BI (cruzamento das 3 planilhas)
GET    /reports/export?format=csv|pdf Exportar relatório

POST   /visits/geofence               Técnico envia localização ao abrir o app
                                      Sistema verifica se há orgs com máquinas offline próximas (raio 5km)
                                      e registra em field\_visits\_no\_collection se ele não coletou dados
```

\---

## App Mobile — Telas (React Native + Expo + TypeScript)

### Funcionalidades gerais

* **Online:** consome API diretamente
* **Offline:** salva ações em fila no AsyncStorage; ao detectar conexão, sincroniza automaticamente com a API e o banco AWS
* **Geolocalização:** ao abrir o app, captura lat/lng do técnico para o indicador de presença sem coleta

### Tela 1 — Login

* Campo único: **ID do funcionário** no formato `x000000` (letra x + 6 dígitos)
* Ao digitar o `x` o campo já inicia o modo de entrada do ID
* Ao completar os 7 caracteres (`x` + 6 dígitos), o app autentica automaticamente — sem botão de confirmação, sem senha
* O ID é validado contra o cadastro de técnicos registrado no admin
* Token de sessão salvo no AsyncStorage para uso offline
* Todos os indicadores de operação do técnico ficam vinculados ao seu ID e são exibidos no admin

### Tela 2 — Busca de Organização

* Campo de busca com autocomplete (mín. 2 caracteres)
* Exibe lista de organizações com contador de máquinas offline
* Botão "Máquina não-JD" para cadastrar equipamento sem chassi

### Tela 3 — Lista de Máquinas Offline

* Mostra somente máquinas com `last\_call\_date` há ≥ 30 dias
* Cards com: chassi/PIN, dias offline, horímetro da última conexão, última data de conexão
* Badge colorido: 🟡 30-60 dias | 🔴 61-365 dias | ⚫ 365+ dias
* Botão "+ Adicionar máquina não-JD" (máquinas sem chassi de outras marcas)

### Tela 4 — Detalhe da Máquina + Horímetro

**Campos exibidos:**

* Chassi/PIN
* Dias offline
* Horímetro registrado na última conexão (vem da planilha MLC, campo `Machine Hour In Period`)
* Campo de input: **"Horímetro atual"** (técnico confere no painel ao ligar a chave)

**Regra de negócio do horímetro:**

```
diferença = horímetro\_atual\_informado − machine\_hours (última conexão da planilha)

SE diferença == 0 OU diferença < 50:
  → Exibir: "Máquina sem uso após última subida de dados"
  → Botão "Confirmar e encerrar" (registra status 'no\_use', não abre timer)

SE diferença >= 50:
  → Exibir campo de seleção de método
  → Botão "Iniciar atividade" (abre Tela 5)
```

### Tela 5 — Atividade em Andamento

* Seleção de método: **"Starlink + Data Sync"** ou **"Pen Drive"**
* Cronômetro em tempo real (HH:MM:SS) rodando desde o clique em "Iniciar"
* Campo de observações (opcional)
* Botão **"Finalizar operação"** → calcula `duration\_minutes`, salva atividade, volta para Tela 3

### Tela 6 — Máquina Não-John Deere

* Campos: nome/identificação da máquina, marca, modelo, descrição, organização
* Sem chassi (não aparece nas planilhas JD)
* Fluxo de horímetro e timer idêntico ao da Tela 4/5

### Sincronização Offline

```
AsyncStorage keys:
  - 'pending\_activities' → array de atividades criadas offline
  - 'pending\_visits' → geolocalização registrada offline
  - 'auth\_token' → token JWT salvo para uso sem conexão
  - 'machines\_cache' → cache da lista de máquinas (TTL: 24h)
  - 'orgs\_cache' → cache das organizações (TTL: 24h)

Ao detectar conexão (NetInfo):
  1. Enviar pending\_activities via POST /activities
  2. Enviar pending\_visits via POST /visits/geofence
  3. Limpar cache expirado
  4. Atualizar machines\_cache e orgs\_cache
```

\---

## Admin — Painel Web (Next.js + TypeScript)

### Tela 1 — Dashboard Principal (BI)

#### Bloco 1 — Conectividade de Máquinas

* Total de máquinas monitoradas
* Gráfico de pizza: % online / 16-60 dias offline / 61-365 dias / 365+ dias
* Tabela: top 10 organizações com mais máquinas offline
* Mapa interativo (Leaflet/MapLibre): pins de última localização conhecida das máquinas, coloridos por faixa de dias offline

#### Bloco 2 — Indicador 18: Adoção e Utilização de Tecnologias (KPI John Deere)

**18.1 — Basic Tech Utilization**

* % de organizações com VCA ativas (Setup File, Equipment Monitoring)
* Semáforo: 🔴 <45% | 🟡 45-58% | 🟢 58-65% | 🟢🟢 >65%

**18.2 — Advanced Tech Utilization**

* % de organizações com VCA avançadas (Work Plan, Agronomic Reports, Work Details)
* Semáforo: 🔴 <10% | 🟡 10-20% | 🟢 10-30% | 🟢🟢 >30%

**18.3 — Harvesting Tech Utilization**

* % de hectares de colheita engajados (YTD Harvest / Máx. Harvest)
* Semáforo: 🔴 <30% | 🟡 30-60% | 🟢 60-80% | 🟢🟢 >80%

**18.4 — % de Hectares em Risco**

* Risk Acres / Total Acres
* Semáforo: 🔴 >20% | 🟡 10-20% | 🟢 5-10% | 🟢🟢 <5%

**18.5 — GAP de Hectares Conectadas**

* Gráfico de barras por operação: Prepare, Plant, Apply, Harvest
* Mostra Máx vs YTD vs GAP por operação
* Tabela de organizações com maior GAP

**18.6 — Engajamento Digital**

* Distribuição de Engagement Level em gráfico de rosca
* `Highly Engaged Retained`, `R12 Digitally Engaged`, `Highly Engaged`, `Land \& Digital`

**18.7 — Modems JDLink**

* Total modems ativos vs inativos
* Máquinas com Gen4/G5 conectadas
* Máquinas conectadas mas sem enviar dados agronômicos

**18.8 — Operations Center Usage**

* % de organizações com login no OC nos últimos 30/60/90 dias (web + mobile)
* Work Plans criados vs concluídos

#### Bloco 3 — Indicadores de Campo (Atividade dos Técnicos)

**Técnicos — Resumo do período (filtro de data)**

* Tabela: técnico | visitas | máquinas coletadas | horas trabalhadas | método mais usado
* Gráfico: horas por técnico por mês (barras empilhadas: Starlink vs Pen Drive)

**Cobertura por Organização**

* Tabela: organização | máquinas offline | técnico que visitou | data da visita | máquinas coletadas | pendentes
* Alerta visual quando técnico esteve presente na fazenda (geofence) mas não coletou nenhum dado

**Mapa de Presença**

* Mapa com trilha dos técnicos
* Pins verdes: visita com coleta realizada
* Pins vermelhos: visita SEM coleta (técnico estava lá, havia máquinas offline, mas não coletou)

### Tela 2 — Upload de Planilhas Mensais

* Três dropzones: `mlc-\*.xlsx`, `cde-\*.xlsx`, `gap-\*.xlsx`
* Campo: mês de referência (date picker)
* Botão "Processar" → chama `POST /upload`
* Barra de progresso do processamento
* Histórico de uploads anteriores com status

### Tela 3 — Atividades Detalhadas

* Tabela com filtros: técnico, organização, período, método, status
* Colunas: data | técnico | fazenda | máquina (chassi) | método | horímetro informado | diff horas | duração | status
* Exportar como CSV ou PDF

### Tela 4 — Gestão de Técnicos (Cadastro)

* **Cadastrar novo técnico:** campos obrigatórios:

  * **ID do funcionário** (formato `x000000` — validado com regex `/^x\\d{6}$/`)
  * **Nome completo**
  * **Role:** `Técnico de Campo` ou `Administrador`
  * E-mail (opcional)
* Editar dados e role de técnicos existentes
* Ativar / desativar acesso (técnico desativado não consegue logar no app)
* Ver histórico completo de atividades por técnico: visitas, máquinas coletadas, horas trabalhadas, métodos usados
* Indicador de último acesso ao app

### Tela 5 — Organizações

* Lista de todas as organizações com status de saúde digital
* Drill-down por organização: máquinas, histórico de coletas, VCAs ativas

\---

## Geolocalização — Indicador de Presença Sem Coleta

**Objetivo:** detectar quando um técnico esteve em uma fazenda/organização que tinha máquinas offline pendentes e não realizou nenhuma coleta.

**Implementação:**

1. Ao abrir o app, o mobile captura lat/lng do técnico e envia para `POST /visits/geofence`
2. A API verifica no banco quais organizações têm `last\_known\_lat/lng` de máquinas dentro de um raio de **5 km** da posição do técnico
3. Se houver máquinas offline ≥ 30 dias nessas organizações, registra em `field\_visits\_no\_collection`
4. Ao final do dia (ou ao fechar o app), verifica se o técnico realizou alguma atividade nessa organização
5. Se não realizou → mantém o registro em `field\_visits\_no\_collection` → admin exibe como alerta

**Nota sobre precisão:** a lat/lng disponível nas planilhas é a **última posição conhecida da máquina** (onde a máquina parou de conectar), não o endereço exato da fazenda. O raio de 5 km é configurável no admin.

\---

## CI/CD — GitHub Actions

### `test.yml` — Roda em todo PR

```yaml
- Instalar dependências (api, admin)
- Rodar testes unitários da API (Jest)
- Build do Next.js admin
- Lint TypeScript
```

### `deploy-api.yml` — Trigger: push na main

```yaml
- Build imagem Docker da api/
- Push para AWS ECR
- Deploy no AWS ECS Fargate (atualiza task definition)
- Health check do endpoint /health
```

### `deploy-admin.yml` — Trigger: push na main

```yaml
- Build Next.js (next build + next export)
- aws s3 sync ./out s3://$S3\_BUCKET\_NAME --delete
- Invalidar cache do CloudFront
```

\---

## Variáveis de Ambiente

### GitHub Secrets (usadas nos workflows)

```
AWS\_ACCESS\_KEY\_ID
AWS\_SECRET\_ACCESS\_KEY
AWS\_REGION
AWS\_ACCOUNT\_ID
ECR\_REPOSITORY\_NAME
ECS\_CLUSTER\_NAME
ECS\_SERVICE\_NAME
S3\_BUCKET\_NAME
CLOUDFRONT\_DISTRIBUTION\_ID
```

### api/.env (local e AWS Secrets Manager em produção)

```
DATABASE\_URL=postgresql://user:pass@host:5432/datasync
JWT\_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
AWS\_REGION=us-east-1
S3\_BUCKET\_NAME=datasync-field-uploads
PORT=3001
```

### admin/.env.local

```
NEXT\_PUBLIC\_API\_URL=https://api.datasync-field.com
NEXTAUTH\_SECRET=xxxxxxxx
```

### mobile/.env

```
EXPO\_PUBLIC\_API\_URL=https://api.datasync-field.com
EXPO\_PUBLIC\_GEOFENCE\_RADIUS\_KM=5
```

\---

## Regras de Negócio — Resumo

|Regra|Condição|Ação|
|-|-|-|
|Máquina offline|`last\_call\_date` ≥ 30 dias atrás ou nula|Aparece na lista do técnico|
|Sem uso|`horímetro\_atual − machine\_hours < 50`|Status "sem uso", sem timer|
|Coleta necessária|`horímetro\_atual − machine\_hours ≥ 50`|Abre seleção de método e timer|
|Presença sem coleta|Técnico em raio 5km de org com máquinas offline e sem atividade registrada|Alerta no admin|
|Máquina não-JD|Sem chassi, cadastrada manualmente|Fluxo idêntico, sem cruzamento com planilhas|
|Sync offline|App sem internet registra em AsyncStorage|Sincroniza automaticamente ao reconectar|
|Upload mensal|Admin sobe os 3 xlsx juntos|API processa e faz upsert em todas as tabelas|

\---

## Indicadores Macro Identificados nas Planilhas Atuais

Com base na análise dos dados reais:

* **409 máquinas** monitoradas no total
* **277 com PIN** (John Deere) + 132 sem PIN identificado
* **59.9%** offline entre 16-60 dias (166 máquinas)
* **28.9%** offline entre 61-365 dias (80 máquinas)
* **11.2%** offline há mais de 365 dias (31 máquinas)
* **40.640 hectares** em risco (Risk Acres)
* **307 modems** JDLink no parque total
* **158 organizações** com dados de saúde digital (CDE)
* **149 organizações** com dados de GAP de hectares
* **4 níveis** de engajamento digital identificados

Todos esses números devem aparecer no dashboard do admin e ser atualizados a cada upload mensal.

\---

## Tecnologias e Dependências Principais

### api/

```json
{
  "express": "^4.18",
  "typescript": "^5",
  "pg": "^8",                    // node-postgres (sem ORM)
  "xlsx": "^0.18",               // leitura dos arquivos Excel
  "aws-sdk": "^2",               // S3
  "jsonwebtoken": "^9",          // geração e verificação de JWT próprio
  "bcryptjs": "^2",              // hash para futuro uso se necessário
  "multer": "^1.4",              // upload de arquivos
  "jest": "^29"                  // testes
}
```

### mobile/

```json
{
  "expo": "\~51",
  "react-native": "0.74",
  "@react-navigation/native": "^6",
  "@react-native-async-storage/async-storage": "^1",
  "@react-native-community/netinfo": "^11",
  "expo-location": "\~17",
  "react-native-maps": "^1",
  "axios": "^1"
}
```

### admin/

```json
{
  "next": "^14",
  "typescript": "^5",
  "next-auth": "^4",
  "recharts": "^2",              // gráficos do BI
  "leaflet": "^1.9",             // mapa interativo
  "xlsx": "^0.18",               // leitura client-side se necessário
  "jspdf": "^2",                 // exportação PDF
  "papaparse": "^5"              // exportação CSV
}
```

