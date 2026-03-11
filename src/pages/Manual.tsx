import { useState } from 'react';
import { Book, Download, ChevronDown, ChevronRight, Printer } from 'lucide-react';

const sections = [
  {
    id: 'intro',
    title: '1. Introdução',
    content: `
## Bem-vindo ao T2-SimplyNvest

O **T2-SimplyNvest** é uma plataforma inteligente de gestão de investimentos que combina tecnologia de ponta com inteligência artificial para ajudá-lo a tomar decisões financeiras mais informadas.

### O que o sistema oferece:
- **Dashboard personalizável** com visão 360° da sua carteira
- **Inteligência Artificial** para análises e recomendações
- **Controle fiscal** automatizado com cálculo de DARF
- **Gestão de dividendos** com projeções futuras
- **Relatórios profissionais** exportáveis (PDF e CSV)
- **Alertas inteligentes** em tempo real com Push e Telegram
- **Suporte a múltiplas corretoras** e tipos de ativos
- **Carteira familiar** para gestão compartilhada
- **Histórico patrimonial** real com snapshots diários
- **Atualização automática** de preços a cada 5 minutos
- **Comparador de ativos** com veredito IA
- **Consultor IA** com recomendações personalizadas
- **Análise de Risco IA** com score de diversificação
- **Benchmark comparativo** (CDI, IBOV, Dólar)

### Requisitos do Sistema:
- Navegador moderno (Chrome, Firefox, Edge, Safari)
- Conexão com internet
- Resolução mínima recomendada: 1280x720

### Primeiro Acesso:
Seu acesso é criado pelo administrador do sistema. Você receberá um e-mail com as credenciais de acesso. No primeiro login, é recomendado alterar sua senha.
    `,
  },
  {
    id: 'login',
    title: '2. Acesso e Autenticação',
    content: `
## Login

1. Acesse o endereço do sistema fornecido pelo administrador
2. Insira seu **e-mail** e **senha**
3. Clique em **"Entrar"**

### Esqueci Minha Senha
1. Na tela de login, clique em **"Esqueceu a senha?"**
2. Insira seu e-mail cadastrado
3. Verifique sua caixa de entrada (e spam) para o link de redefinição
4. Crie uma nova senha segura (mínimo 6 caracteres)

### Licença e Ativação
O sistema utiliza **chaves seriais** para controle de licença:
- **Plano Standard**: Funcionalidades básicas de gestão
- **Plano Premium**: Todas as funcionalidades + IA avançada

Para ativar sua licença:
1. Vá em **Configurações → Licença**
2. Insira a chave serial fornecida
3. Clique em **"Ativar Licença"**
4. O sistema confirmará a ativação e o período de validade

> ⚠️ Licenças expiradas ou congeladas restringem o acesso ao sistema. Contate o administrador para renovação.
    `,
  },
  {
    id: 'dashboard',
    title: '3. Dashboard Principal',
    content: `
## Visão Geral do Dashboard

O Dashboard é a tela principal do sistema, oferecendo uma visão completa e personalizável de toda sua carteira.

### Painéis Disponíveis:

#### 📊 Resumo da Carteira
- Patrimônio total investido
- Rentabilidade geral (R$ e %)
- Variação no dia
- Countdown para próxima atualização automática (5 min)

#### 🏥 Score de Saúde
- Nota de 0 a 100 para sua carteira
- Avaliação de diversificação, risco e concentração
- Recomendações de melhoria
- Rate limiting: máx. 4 consultas IA/minuto

#### 📈 Gráfico de Evolução
- Evolução patrimonial ao longo do tempo
- Comparação com benchmarks (CDI, IBOV, IFIX)
- Filtros de período (1M, 3M, 6M, 1A, Total)

#### 📊 Histórico Patrimonial (Real)
- Gráfico baseado em **snapshots reais** salvos diariamente
- Linha de patrimônio + linha tracejada de custo
- Dados construídos automaticamente a cada login
- Filtros: 7D, 1M, 3M, 6M, 1A, Total

#### 🎯 Alocação por Tipo
- Gráfico de pizza com distribuição por classe de ativo
- Percentuais: Ações, FIIs, ETFs, Renda Fixa, Cripto

#### ⚖️ Rebalanceamento
- Comparação alocação atual vs. ideal
- Sugestões automáticas de compra/venda para rebalancear

#### 🔗 Correlação (Heatmap)
- Mapa de calor mostrando correlação entre seus ativos
- Identificação de ativos muito correlacionados (risco de concentração)

#### 📉 Performance por Ativo
- Rentabilidade individual de cada ativo
- Comparação de desempenho entre ativos

#### 💰 Dividendos
- Últimos dividendos recebidos
- Total recebido no mês/ano
- Yield on Cost médio

#### 🔮 Previsão de Dividendos
- Projeção de dividendos futuros com IA
- Estimativa de rendimento mensal

#### 📋 Tabela de Ativos
- Lista completa dos seus ativos
- Quantidade, preço médio, valor atual, rentabilidade
- Opções de adicionar, editar e vender

#### 🔔 Alertas de Preço
- Alertas configurados e disparados
- Status em tempo real

#### 💱 Câmbio
- Cotações USD/BRL, EUR/BRL, BTC/BRL
- Variação do dia

#### 🎮 Simulador
- Simule aportes futuros
- Projeção de patrimônio com taxa de retorno estimada

#### 🎯 Metas de Investimento
- Defina metas financeiras (aposentadoria, reserva, etc.)
- Acompanhe o progresso visualmente

#### 📰 Notícias
- Notícias relevantes do mercado financeiro
- Atualizadas via IA

#### 🤖 Insights IA
- Análises automáticas da sua carteira
- Recomendações personalizadas

#### ⚡ Alertas Inteligentes
- Análise automatizada de oportunidades e riscos
- Notificações baseadas em IA
- Proteção contra excesso de chamadas (rate limiting)

#### 🔔 Notificações Push (PWA)
- Receba alertas diretamente no navegador/celular
- Ative clicando no ícone 🔔 no painel de alertas
- Funciona mesmo com o app minimizado (quando instalado como PWA)

#### 💡 Aporte Inteligente
- Sugestão de onde alocar novos aportes
- Baseado no rebalanceamento ideal

#### 📊 Preço Teto
- Cálculo do preço teto de ações e FIIs
- Baseado em dividendos e taxa desejada

#### 📈 Rentabilidade Detalhada
- Análise detalhada de rentabilidade por ativo e período

#### 🔄 Backtesting
- Simule estratégias com dados históricos
- Compare resultados com buy & hold

#### ⭐ Scoring de Ativos
- Nota de qualidade para cada ativo (0-100)
- Análise fundamentalista via IA

#### 🏦 Renda Fixa
- Gestão de títulos de renda fixa
- CDB, LCI, LCA, Tesouro Direto, Debêntures
- Controle de vencimento e indexadores

#### 📊 Benchmark Comparativo (CDI/IBOV/Dólar)
- Gráfico comparativo da sua carteira vs índices do mercado
- Compare seu desempenho com CDI, Ibovespa e Dólar
- Períodos: 3M, 6M, 1A, 2A
- Dados normalizados em % para comparação justa
- Identifique se sua carteira está batendo os benchmarks

#### 🤖 Consultor IA de Investimentos
- Recomendações personalizadas de **comprar, manter ou vender**
- Streaming em tempo real com respostas detalhadas
- Perguntas rápidas pré-configuradas ou pergunte o que quiser
- Análise considera alocação, risco, concentração e performance
- Sugestões de novos ativos para diversificação
- Disclaimer automático (não constitui recomendação formal)

#### 🛡️ Análise de Risco IA
- **Score de Risco** (1-10): avaliação geral do perfil de risco
- **Score de Diversificação** (1-10): qualidade da diversificação
- **Nível de Concentração**: Baixo, Médio, Alto ou Crítico
- **Principais Riscos**: lista detalhada com severidade e mitigação
- **Sugestões práticas** para reduzir riscos
- Classificação automática: Conservador, Moderado, Arrojado ou Agressivo

### Personalização do Dashboard

O Dashboard é **totalmente personalizável**:

1. **Mover painéis**: Clique e arraste qualquer painel para reposicioná-lo
2. **Redimensionar**: Arraste as bordas dos painéis para alterar o tamanho
3. **Travar layout**: Clique no ícone de cadeado (🔒) para impedir movimentações acidentais
4. **Resetar layout**: Clique no ícone de reset (↩️) para voltar ao layout padrão

### Atualização Automática de Preços

- Os preços são atualizados automaticamente a cada **5 minutos**
- Um countdown exibe o tempo restante para a próxima atualização
- Clique no botão de refresh para atualizar manualmente a qualquer momento
- Fontes: Yahoo Finance, CoinGecko (cripto), AwesomeAPI (câmbio)

> 💡 O layout é salvo automaticamente no navegador. Cada usuário tem seu layout personalizado.
    `,
  },
  {
    id: 'holdings',
    title: '4. Gestão de Ativos',
    content: `
## Adicionando Ativos à Carteira

### Adicionar Manualmente

1. No Dashboard, localize o painel **"Meus Ativos"**
2. Clique no botão **"+ Adicionar"**
3. Preencha os campos:
   - **Ticker**: Código do ativo (ex: PETR4, HGLG11, IVVB11)
   - **Nome**: Nome descritivo
   - **Tipo**: Ação, FII, ETF, Cripto ou Renda Fixa
   - **Quantidade**: Número de cotas/ações
   - **Preço Médio**: Preço médio de aquisição
   - **Corretora**: (Opcional) Nome da corretora
   - **Setor**: (Opcional) Setor do ativo
4. Clique em **"Salvar"**

### Importar da B3

1. Acesse o portal do investidor da B3 (cei.b3.com.br)
2. Exporte seu extrato em formato PDF ou CSV
3. No SimplyNvest, use o painel de **importação B3** no Dashboard
4. Faça upload do arquivo
5. O sistema processará automaticamente seus dados

### Importar Nota de Corretagem

1. Obtenha a nota de corretagem em PDF da sua corretora
2. No sistema, use o importador de **Nota de Corretagem**
3. Faça upload do PDF
4. A IA extrairá automaticamente as operações
5. Revise e confirme os dados antes de salvar

### Editar Ativo

1. Clique no ativo desejado na tabela
2. O modal de edição será aberto
3. Altere os campos necessários
4. Clique em **"Salvar"**

### Registrar Venda

1. Clique no ativo que deseja vender
2. Clique em **"Vender"**
3. Informe:
   - Quantidade vendida
   - Preço de venda
   - Data da operação
   - Se é Day Trade
4. O sistema calculará automaticamente o lucro/prejuízo
5. A transação será registrada para fins fiscais
    `,
  },
  {
    id: 'ai-trader',
    title: '5. AI Pro Trader',
    content: `
## Inteligência Artificial para Trading

O **AI Pro Trader** é um assistente de investimentos baseado em inteligência artificial que analisa sua carteira e o mercado para fornecer recomendações personalizadas.

### Tipos de Análise Disponíveis:

#### 📈 Position Trades
- Sugestões de operações de médio/longo prazo
- Pontos de entrada, stop loss e alvos de preço
- Justificativa completa com análise técnica e fundamentalista

#### 🛒 Compra & Venda
- Recomendações do que comprar e vender no momento
- Análise individual de cada ativo da carteira
- Identificação de oportunidades de mercado

#### 📊 Revisão da Carteira
- Análise completa de diversificação
- Avaliação de correlações e riscos
- Sugestões de melhoria na alocação

#### 🌍 Análise Macro
- Cenário econômico atual (Selic, inflação, dólar)
- Impacto na sua carteira
- Perspectivas e tendências globais

#### 🛡️ Gestão de Risco
- Identificação de concentrações perigosas
- Sugestões de stops e dimensionamento
- Proteção do patrimônio

### Como Usar:

1. Acesse **AI Pro Trader** no menu lateral
2. Na barra inferior, escolha um tipo de análise ou digite sua pergunta
3. A IA analisará sua carteira real e o mercado
4. A resposta incluirá dados, gráficos e recomendações

### Histórico de Conversas
- Todas as conversas são salvas automaticamente
- Acesse o histórico clicando no ícone de **painel lateral**
- Você pode retomar qualquer conversa anterior
- Use **"Nova Conversa"** para iniciar uma análise limpa

### Chatbot do Dashboard
- No Dashboard principal, há um **chatbot flutuante** (ícone 🤖 no canto inferior direito)
- Faça perguntas rápidas sobre sua carteira
- O chatbot tem acesso a todos os seus dados em tempo real

> ⚠️ **Importante**: As análises de IA são sugestões baseadas em dados. Não constituem recomendação de investimento. Consulte sempre um profissional certificado.
    `,
  },
  {
    id: 'dividends',
    title: '6. Dividendos',
    content: `
## Gestão de Dividendos

A tela de **Dividendos** oferece controle completo sobre seus proventos recebidos e previstos.

### Funcionalidades:

#### Histórico de Dividendos
- Lista completa de todos os dividendos recebidos
- Filtros por período, tipo de ativo e ticker
- Valor total recebido por período

#### Dividend Yield
- Yield atual de cada ativo
- Yield on Cost (com base no seu preço médio)
- Ranking dos melhores pagadores

#### Calendário de Proventos
- Datas de ex-dividendo e pagamento
- Próximos dividendos previstos

#### Previsão com IA
- Projeção de dividendos futuros
- Estimativa mensal e anual
- Baseada no histórico de pagamentos

### Dashboard de Dividendos (Painel)
O painel de dividendos no Dashboard mostra:
- Último dividendo recebido
- Total do mês e do ano
- Média mensal
- Yield médio da carteira
    `,
  },
  {
    id: 'taxes',
    title: '7. Impostos e DARF',
    content: `
## Controle Fiscal de Investimentos

O módulo de **Impostos** automatiza o cálculo de IR sobre operações na bolsa, conforme legislação brasileira.

### Regras Fiscais Implementadas:

| Tipo | Alíquota | Isenção |
|------|----------|---------|
| Ações (Swing Trade) | 15% | Vendas até R$ 20.000/mês |
| Ações (Day Trade) | 20% | Sem isenção |
| FIIs | 20% | Sem isenção |
| ETFs | 15% | Sem isenção |
| Cripto | 15% | Vendas até R$ 35.000/mês |

### Registrando Operações:

1. Acesse **Impostos** no menu lateral
2. Clique em **"+ Nova Operação"**
3. Preencha:
   - Ticker, Nome, Tipo de ativo
   - Operação (Compra/Venda)
   - Quantidade e Preço
   - Data e Taxas/Corretagem
   - Se é Day Trade
4. Clique em **"Salvar"**

### Importação via Nota de Corretagem
1. Clique em **"Importar"**
2. Faça upload do PDF da nota de corretagem
3. A IA extrairá automaticamente todas as operações
4. Revise e confirme

### Cálculo de DARF:
- O sistema calcula automaticamente o imposto devido por mês
- Compensa prejuízos acumulados de meses anteriores
- Indica o código DARF correto para cada tipo de operação
- Mostra se há imposto a pagar ou isenção

### Gráficos e Análises:
- Gráfico mensal de lucros/prejuízos
- Total de impostos pagos no ano
- Prejuízo acumulado a compensar
- Breakdown por tipo de ativo

### Exportação:
- Exporte o relatório fiscal em formato adequado
- Útil para declaração de IR anual
    `,
  },
  {
    id: 'analysis',
    title: '8. Análise Avançada',
    content: `
## Análise Técnica e Fundamentalista

A tela de **Análise Avançada** oferece ferramentas profissionais para análise de ativos.

### 🏢 Perfil do Ativo (Sobre):
- Resumo completo do ativo com dados reais coletados de fontes públicas
- Informações: Administrador, Gestor, Segmento, Classificação, Listagem, Taxas
- **Destaques** do ativo (Dividend Yield, Liquidez, Gestão)
- **Estratégia** descritiva do fundo ou empresa
- Dados obtidos de Investidor10, StatusInvest e FundsExplorer

### 🏗️ Lista de Imóveis (FIIs):
- Disponível apenas para **Fundos Imobiliários** (FIIs)
- Lista completa de propriedades do fundo com endereços
- Informações: Nome, Tipo, Cidade, Estado, Área (m²), Endereço
- **Gráfico de distribuição** por estado (donut chart)
- **Barras por estado** com contagem de imóveis
- Dados coletados de Investidor10 e StatusInvest via IA

### 📰 Notícias de Mercado e Opinião IA:
- Varredura automática nos principais portais financeiros brasileiros e mundiais
- Fontes: Google News, InfoMoney, Valor Econômico, Bloomberg, Reuters
- **Sentimento de mercado**: Muito Positivo, Positivo, Neutro, Negativo, Muito Negativo
- **Nível de confiança** da análise (%)
- **Catalisadores** classificados por impacto (Positivo/Negativo/Neutro)
- **Opinião consolidada da IA** baseada nas notícias encontradas

### 🤖 Sinal IA (Compra/Venda/Manter):
- Badge com recomendação automática baseada em análise técnica e fundamentalista
- Considera: indicadores técnicos, candles, posição na carteira, fundamentos
- Score de confiança e justificativa da recomendação

### Análise Técnica:
- **Gráfico de Candlestick** interativo
- Indicadores técnicos:
  - Médias Móveis (SMA 20, 50, 200)
  - Bandas de Bollinger
  - RSI (Índice de Força Relativa)
  - MACD (Moving Average Convergence Divergence)
  - Estocástico
  - ATR (Average True Range)

### Análise Fundamentalista (via IA):
- P/L (Preço/Lucro)
- P/VP (Preço/Valor Patrimonial)
- ROE (Return on Equity)
- Dividend Yield
- Margem Líquida
- Dívida Líquida/EBITDA

### Widget TradingView:
- Gráfico profissional integrado do TradingView
- Ferramentas de desenho e análise
- Múltiplos timeframes

### Resumo Gráfico IA:
- Análise automática do padrão gráfico atual
- Identificação de suportes, resistências e tendências
- Disponível tanto no gráfico TradingView quanto no Customizado

### Análise IA do Ativo:
1. Digite o ticker na barra de busca
2. O sistema buscará dados em tempo real
3. A IA gerará uma análise completa incluindo:
   - Cenário técnico atual
   - Fundamentos da empresa
   - Recomendação (Compra/Venda/Manter)
   - Preço-alvo estimado

### Como Usar:
1. Acesse **Análise Avançada** no menu
2. Selecione um ativo da carteira (acesso rápido) ou busque pelo ticker
3. Veja o **Perfil do ativo** e **Lista de imóveis** (FIIs) automaticamente
4. Clique em **"Analisar notícias de mercado"** para varredura de portais
5. Alterne entre gráficos **TradingView** e **Customizado**
6. Consulte indicadores técnicos, fundamentalistas e análise IA nas 3 colunas
    `,
  },
  {
    id: 'reports',
    title: '9. Relatórios',
    content: `
## Relatórios Profissionais

O módulo de **Relatórios** gera documentos completos sobre sua carteira.

### Abas de Relatório:

#### 📊 Visão Geral
- Resumo executivo da carteira
- Patrimônio, rentabilidade, número de ativos
- Comparação com benchmarks

#### 📈 Performance
- Gráfico de evolução patrimonial
- Rentabilidade por período
- Comparação com CDI, IBOV, IFIX

#### 🎯 Alocação
- Distribuição por tipo de ativo
- Distribuição por setor
- Distribuição por corretora

#### 🏦 Corretoras
- Patrimônio por corretora
- Comparação de custos
- Diversificação entre plataformas

#### 📋 Transações
- Histórico completo de operações
- Filtros por tipo, período e ativo
- Lucros/Prejuízos realizados

### Filtros de Período:
- 1 Mês, 3 Meses, 6 Meses, 1 Ano, Total

### Exportação:
- **PDF**: Clique em "Exportar PDF" para gerar relatório formatado para impressão
- **CSV Carteira**: Exporta todos os ativos com preço médio, atual, resultado e alocação
- **CSV Transações**: Exporta histórico completo de operações (compras, vendas, taxas)
- Arquivos CSV compatíveis com Excel (separador ;, codificação UTF-8)
    `,
  },
  {
    id: 'family',
    title: '10. Carteira Familiar',
    content: `
## Gestão de Carteira Familiar

O recurso de **Carteira Familiar** permite compartilhar e visualizar carteiras de membros da família.

### Configuração:

1. Acesse **Carteira Familiar** no menu lateral
2. Ou vá em **Configurações → Família**
3. Clique em **"Convidar Membro"**
4. Insira o e-mail do familiar
5. O membro receberá um convite para vincular sua conta

### Funcionalidades:
- **Visão consolidada**: Patrimônio total da família
- **Comparação**: Compare a performance entre membros
- **Alocação familiar**: Veja a diversificação da família como um todo
- **Ranking**: Quem está performando melhor

### Permissões:
- O proprietário pode ver as carteiras dos membros
- Membros podem ver apenas sua própria carteira (por padrão)
- Dados sensíveis são protegidos por criptografia

### Status dos Convites:
- **Pendente**: Convite enviado, aguardando aceitação
- **Aceito**: Membro vinculado com sucesso
- **Recusado**: Convite recusado pelo membro
    `,
  },
  {
    id: 'settings',
    title: '11. Configurações',
    content: `
## Configurações do Sistema

### Abas Disponíveis:

#### ⚙️ Geral
- Informações da conta
- Tema (Claro/Escuro) — alternável pelo ícone 🌙/☀️
- Preferências de exibição

#### 📋 Licença
- Status da licença atual
- Plano ativo (Standard/Premium)
- Data de expiração
- Ativar nova chave serial

#### 👥 Usuários (Admin)
- Gerenciar usuários do sistema
- Criar novos usuários
- Ativar/desativar contas
- Atribuir papéis (Admin/Usuário)

#### 🔑 Chaves (Admin)
- Gerar novas chaves seriais
- Visualizar chaves existentes
- Status: Ativa, Usada, Expirada
- Copiar chave para envio ao cliente

#### 👨‍👩‍👧‍👦 Família
- Gerenciar membros da carteira familiar
- Enviar e gerenciar convites

#### 📱 Telegram
- Configurar notificações via Telegram
- Vincular bot do Telegram
- Receber alertas de preço no celular
- Relatório diário automático

#### 💾 Backup
- Backup manual dos dados
- Histórico de backups
- Restauração de dados

#### 📋 Atividades (Auditoria)
- Log de todas as ações realizadas no sistema
- Quem fez o quê e quando
- Útil para segurança e rastreabilidade
    `,
  },
  {
    id: 'telegram',
    title: '12. Integração Telegram',
    content: `
## Integração Completa com Telegram

O T2-SimplyNvest possui um **bot Telegram completo** com 10 funcionalidades integradas, permitindo acompanhar sua carteira e interagir com a IA diretamente pelo celular.

### Configuração Inicial:

#### Método Recomendado — Vinculação pelo Bot:
1. Acesse **Configurações → Telegram**
2. Clique em **"Gerar Link de Vinculação"**
3. Clique em **"🤖 Abrir no Telegram"**
4. No Telegram, clique em **"Start"** — pronto!

#### Método Manual (Avançado):
1. No Telegram, busque **@userinfobot** e envie qualquer mensagem
2. Copie seu **Chat ID**
3. Em **Configurações → Telegram**, expanda "Configuração manual"
4. Cole o Chat ID e clique em **"Salvar"**
5. Use **"Testar"** para confirmar o envio

---

### 📱 Funcionalidades do Bot

#### 1. 💰 Resumo Diário Automático
- Enviado automaticamente às **18h** todos os dias
- Inclui: patrimônio total, variação do dia, top 3 altas e baixas
- Powered by IA para análise contextualizada

#### 2. 📊 Relatório Semanal
- Enviado toda **segunda-feira** automaticamente
- Evolução patrimonial da semana com gráfico ASCII
- Comparação semanal de performance
- Destaque dos melhores e piores ativos

#### 3. 🚨 Alertas de Stop Loss / Take Profit
- Monitoramento contínuo dos preços dos seus ativos
- Notificação instantânea quando um alerta é disparado
- Tipos suportados: preço acima, preço abaixo, variação %, stop loss, take profit
- Configure alertas pelo Dashboard em **Alertas → + Novo Alerta** com "Notificar Telegram" ativado

#### 4. 💰 Alertas de Dividendos
- Notificação de dividendos previstos para os **próximos 7 dias**
- Inclui: ticker, valor esperado, data de pagamento e tipo
- Total consolidado de dividendos esperados

#### 5. 🤖 Chat com IA via Telegram
- Envie \`/perguntar [sua dúvida]\` para consultar o Consultor IA
- A IA tem acesso à sua carteira real para respostas personalizadas
- Exemplos:
  - \`/perguntar Vale a pena comprar PETR4?\`
  - \`/perguntar Qual meu ativo mais arriscado?\`
  - \`/perguntar Devo rebalancear minha carteira?\`

#### 6. ⚡ Comandos Rápidos
| Comando | Descrição |
|---------|-----------|
| \`/carteira\` | Resumo completo da carteira com patrimônio e rentabilidade |
| \`/cotacao PETR4\` | Cotação atual de qualquer ativo |
| \`/ranking\` | Top 5 ativos por rentabilidade |
| \`/saude\` | Score de saúde da carteira (0-100) |
| \`/dividendos\` | Próximos dividendos esperados |
| \`/metas\` | Progresso das metas de investimento |
| \`/perguntar [texto]\` | Consulta livre ao Consultor IA |
| \`/senha\` | Link para alterar a senha |

#### 7. 🔔 Alerta de Rebalanceamento
- Análise automática da concentração da carteira
- Notifica quando a alocação desvia significativamente do ideal
- Sugestões de compra/venda com valores exatos para rebalancear

#### 8. 📰 Breaking News
- Notícias relevantes geradas por IA sobre os ativos da sua carteira
- Classificação de impacto: 🟢 positivo, 🔴 negativo, 🟡 neutro
- Resumo de 3-5 notícias com análise de impacto

#### 9. 🎯 Acompanhamento de Metas
- Notificação quando metas atingem marcos de **25%, 50%, 75% e 100%**
- Inclui: nome da meta, valor atual vs. alvo, percentual atingido
- Mensagens motivacionais personalizadas por marco

#### 10. 🔐 Alertas de Segurança
- **Novo login**: notificação com dispositivo, IP e data/hora
- **Senha alterada**: confirmação de alteração de senha
- **Licença expirando**: aviso com dias restantes
- **Licença expirada**: alerta de bloqueio iminente
- **Transação grande**: notificação de operações de alto valor
- **Atividade suspeita**: alertas de comportamento incomum

---

### Gerenciamento:
- Ative/desative todas as notificações pelo switch em **Configurações → Telegram**
- Use o botão **"Testar"** para verificar se o bot está funcionando
- O código de vinculação é único por usuário e pode ser regenerado

> 💡 **Dica**: Instale o Telegram no celular para receber alertas em tempo real, mesmo quando não estiver no computador.

> ⚠️ **Importante**: Os alertas automáticos (diário, semanal, stop loss, dividendos, rebalanceamento, news, metas) são executados por agendamentos no servidor. Contate o administrador para ativar os cron jobs.
    `,
  },
  {
    id: 'alerts',
    title: '13. Alertas de Preço',
    content: `
## Sistema de Alertas

### Criando um Alerta:

1. No Dashboard, localize o painel **"Alertas"**
2. Clique em **"+ Novo Alerta"**
3. Configure:
   - **Ticker**: Ativo monitorado
   - **Tipo de Alerta**:
     - Preço acima de (Take Profit)
     - Preço abaixo de (Stop Loss)
     - Variação positiva (%)
     - Variação negativa (%)
   - **Valor alvo**: Preço ou percentual
   - **Notificar via Telegram**: Sim/Não
4. Clique em **"Criar Alerta"**

### Canais de Notificação:

#### 🔔 Push Notifications (navegador)
- Clique no ícone **🔔** no painel de alertas para ativar
- O navegador pedirá permissão para enviar notificações
- Funciona mesmo com o app minimizado (quando instalado como PWA)
- Não precisa de Telegram configurado

#### 📱 Telegram
- Configure em **Configurações → Telegram**
- Receba alertas diretamente no celular via bot

### Status dos Alertas:
- 🟢 **Ativo**: Monitorando em tempo real
- 🟡 **Disparado**: Condição atingida
- ⏸️ **Pausado**: Temporariamente desativado

### Alertas Inteligentes (IA):
O painel de **Alertas Inteligentes** usa IA para:
- Detectar padrões técnicos (suporte/resistência)
- Identificar oportunidades de compra/venda
- Alertar sobre riscos macroeconômicos
- Monitorar mudanças nos fundamentos
    `,
  },
  {
    id: 'fixed-income',
    title: '14. Renda Fixa',
    content: `
## Gestão de Renda Fixa

O painel de **Renda Fixa** permite gerenciar seus investimentos em títulos.

### Tipos Suportados:
- **CDB** (Certificado de Depósito Bancário)
- **LCI/LCA** (Letras de Crédito Imobiliário/Agrícola)
- **Tesouro Direto** (SELIC, IPCA+, Prefixado)
- **Debêntures**
- **CRI/CRA**

### Campos de Cadastro:
- Título/Nome do investimento
- Tipo e Indexador (CDI, IPCA, Prefixado, SELIC)
- Taxa contratada (ex: CDI + 2%, IPCA + 6%)
- Valor investido
- Data de vencimento
- Corretora

### Acompanhamento:
- Valor atualizado estimado
- Rentabilidade no período
- Dias até o vencimento
- Indicação de vencimentos próximos
    `,
  },
  {
    id: 'cash',
    title: '15. Saldo em Caixa',
    content: `
## Controle de Saldo em Caixa

O sistema permite controlar o saldo disponível em caixa nas suas corretoras.

### Funcionalidades:
- Registrar saldo por corretora
- Acompanhar movimentações (depósitos/retiradas)
- Incluir saldo no patrimônio total

### Como Usar:
1. No Dashboard, clique no valor do **Saldo em Caixa**
2. Adicione ou edite o saldo de cada corretora
3. Registre depósitos e retiradas com descrição

### Importância:
- O saldo em caixa é somado ao patrimônio total
- Ajuda no planejamento de novos aportes
- Controle de liquidez disponível
    `,
  },
  {
    id: 'pwa',
    title: '16. Instalação como App (PWA)',
    content: `
## Instalar no Celular ou Desktop

O T2-SimplyNvest pode ser instalado como um **aplicativo** no seu celular ou computador.

### No Celular (Android/iOS):
1. Acesse o sistema pelo navegador
2. Um banner aparecerá sugerindo a instalação
3. Clique em **"Instalar"**
4. O app ficará na tela inicial do celular

### No Desktop (Chrome):
1. Acesse o sistema
2. Clique no ícone de instalação na barra de endereço (📥)
3. Confirme a instalação
4. O app abrirá em janela própria

### Vantagens do PWA:
- Acesso rápido pela tela inicial
- Experiência de app nativo
- Funciona em tela cheia
- Ícone personalizado
    `,
  },
  {
    id: 'admin',
    title: '17. Administração (Admin)',
    content: `
## Funcionalidades Administrativas

Disponível apenas para usuários com papel **Admin**.

### Gestão de Usuários:
1. Acesse **Configurações → Usuários**
2. Funções disponíveis:
   - **Criar usuário**: E-mail + senha temporária
   - **Ativar/Desativar**: Controle de acesso
   - **Definir papel**: Admin ou Usuário padrão

### Gestão de Chaves Seriais:
1. Acesse **Configurações → Chaves**
2. Clique em **"Gerar Chave"**
3. Selecione o plano (Standard/Premium)
4. A chave será gerada automaticamente (formato: XXXX-XXXX-XXXX-XXXX)
5. Copie e envie ao cliente

### Status das Chaves:
- **Disponível**: Pronta para uso
- **Ativada**: Em uso por um cliente
- **Expirada**: Período de validade encerrado
- **Congelada**: Suspensa pelo administrador

### Log de Auditoria:
- Todas as ações administrativas são registradas
- Acesse em **Configurações → Atividades**
- Inclui: criação de usuários, geração de chaves, alterações de configuração

### Backup do Sistema:
- **Configurações → Backup**
- Backup manual ou automático
- Inclui: carteira, transações, configurações
    `,
  },
  {
    id: 'comparator',
    title: '18. Comparador de Ativos',
    content: `
## Comparador de Ativos

O **Comparador** permite analisar lado a lado até 3 ativos simultaneamente.

### Como Usar:

1. Acesse **Comparador** no menu lateral
2. Pesquise e adicione até **3 ativos** para comparar
3. O sistema carregará automaticamente:
   - Preços e variações
   - Indicadores técnicos (RSI, MACD, Médias Móveis)
   - Indicadores fundamentalistas (P/L, P/VP, DY)
   - Sinal IA (Compra/Venda/Manter)

### Veredito IA:

Após adicionar os ativos:
1. Clique no botão **"🏆 Veredito IA"**
2. A IA analisará todos os indicadores comparativamente
3. O resultado incluirá:
   - **Ativo vencedor** destacado
   - Justificativa detalhada
   - Tabela comparativa resumida
4. Clique em **"Atualizar"** para refazer a análise

> 💡 O veredito considera análise técnica, fundamentalista, momento de mercado e dados de preço em tempo real.
    `,
  },
  {
    id: 'shortcuts',
    title: '19. Dicas e Atalhos',
    content: `
## Dicas para Melhor Uso

### 🎨 Tema Escuro/Claro
- Clique no ícone 🌙/☀️ no menu lateral para alternar

### 📱 Responsividade
- O sistema se adapta a qualquer tela
- No celular, o menu lateral vira um drawer (hamburger menu)

### 🔍 Busca de Ativos
- Na Análise Avançada, use a barra de busca para encontrar qualquer ativo
- Digite o ticker (ex: PETR4) ou nome da empresa

### 📊 Dashboard Personalizado
- Arraste os painéis para reorganizar
- Redimensione conforme sua preferência
- Trave o layout quando estiver satisfeito

### 💡 Chatbot IA
- Use o chatbot no canto inferior direito do Dashboard
- Pergunte qualquer coisa sobre sua carteira
- Exemplos:
  - "Qual meu ativo mais rentável?"
  - "Quanto recebi de dividendos este ano?"
  - "Devo vender PETR4?"

### 📤 Exportação de Dados
- **PDF**: Use o botão "Exportar PDF" em Relatórios
- **CSV Carteira**: Exporta ativos com preço médio, atual e resultado
- **CSV Transações**: Exporta todas as operações para Excel
- **Manual**: Imprima este manual via botão "Imprimir / Salvar PDF"

### 🔄 Atualização Automática
- Preços atualizam automaticamente a cada 5 minutos
- O countdown aparece no card "Última Atualização" do Dashboard
- Clique no botão refresh para atualizar manualmente

### ⚡ Rate Limiting IA
- O sistema protege contra excesso de chamadas à IA
- Máximo 4 consultas por minuto
- Aguarde 10 segundos entre consultas consecutivas

### 🔐 Segurança
- Sempre faça logout ao usar computadores compartilhados
- Não compartilhe suas credenciais
- Altere sua senha periodicamente
    `,
  },
  {
    id: 'support',
    title: '20. Suporte e Contato',
    content: `
## Suporte Técnico

### Problemas Comuns:

#### "Não consigo fazer login"
1. Verifique se o e-mail está correto
2. Use a opção "Esqueci minha senha"
3. Verifique se sua licença não expirou
4. Contate o administrador

#### "Dados não aparecem"
1. Verifique sua conexão com internet
2. Faça logout e login novamente
3. Limpe o cache do navegador (Ctrl+Shift+Del)
4. Tente outro navegador

#### "Sistema lento"
1. Verifique sua conexão de internet
2. Feche outras abas/programas
3. Use um navegador atualizado
4. Limpe o cache do navegador

#### "Cotações desatualizadas"
- As cotações são obtidas em tempo real via Yahoo Finance
- Pode haver atraso de 15-20 minutos em algumas fontes
- Fora do horário do mercado, mostra último preço disponível

### Contato:
- **E-mail**: suporte@t2systems.com.br
- **Telegram**: Entre em contato com o administrador
- **Horário**: Segunda a Sexta, 9h às 18h

---

**T2-SimplyNvest** — Investimentos Inteligentes  
*Versão 2.0 — Manual do Usuário*  
*© 2025 T2 Systems. Todos os direitos reservados.*
    `,
  },
];

export default function Manual() {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(sections.map(s => s.id)));

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setOpenSections(new Set(sections.map(s => s.id)));
  const collapseAll = () => setOpenSections(new Set());

  const handlePrint = () => {
    expandAll();
    setTimeout(() => window.print(), 300);
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      {/* Header - hidden on print */}
      <div className="flex items-center justify-between mb-8 print:hidden">
        <div className="flex items-center gap-3">
          <Book className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Manual do Usuário</h1>
            <p className="text-sm text-muted-foreground">T2-SimplyNvest — Guia Completo</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-accent/50 transition-colors"
          >
            Expandir Tudo
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-accent/50 transition-colors"
          >
            Recolher Tudo
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Printer className="h-4 w-4" />
            Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-8 text-center border-b-2 border-primary pb-6">
        <img src="/pwa-icon-192.png" alt="T2" className="h-16 w-16 mx-auto mb-4 rounded-xl" />
        <h1 className="text-3xl font-bold mb-2">T2-SimplyNvest</h1>
        <h2 className="text-xl text-muted-foreground mb-1">Manual do Usuário</h2>
        <p className="text-sm text-muted-foreground">Versão 2.0 — Guia Completo de Funcionalidades</p>
      </div>

      {/* Table of Contents - print only */}
      <div className="hidden print:block mb-8 p-6 border rounded-lg">
        <h2 className="text-lg font-bold mb-4">Índice</h2>
        <div className="grid grid-cols-2 gap-1">
          {sections.map((s, i) => (
            <div key={s.id} className="text-sm py-0.5">
              {s.title}
            </div>
          ))}
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-3 print:space-y-6">
        {sections.map((section) => {
          const isOpen = openSections.has(section.id);
          return (
            <div key={section.id} className="border border-border rounded-lg overflow-hidden print:border-none print:break-inside-avoid-page">
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/30 transition-colors print:hidden"
              >
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <span className="font-semibold text-base">{section.title}</span>
              </button>
              <div className={`${isOpen ? 'block' : 'hidden'} print:!block`}>
                <div
                  className="px-6 pb-6 prose prose-sm dark:prose-invert max-w-none
                    prose-headings:text-foreground prose-p:text-foreground/90
                    prose-strong:text-foreground prose-li:text-foreground/90
                    prose-a:text-primary prose-code:text-primary
                    prose-blockquote:border-primary/50 prose-blockquote:text-muted-foreground
                    prose-table:text-sm prose-th:bg-muted prose-th:px-3 prose-th:py-2
                    prose-td:px-3 prose-td:py-2 prose-td:border-border
                    print:text-black print:prose-headings:text-black"
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(section.content) }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer - print only */}
      <div className="hidden print:block mt-12 pt-4 border-t text-center text-xs text-muted-foreground">
        <p>T2-SimplyNvest — Manual do Usuário v3.0</p>
        <p>© 2025 T2 Systems. Todos os direitos reservados.</p>
      </div>
    </div>
  );
}

// Simple markdown to HTML converter (no external deps)
function markdownToHtml(md: string): string {
  let html = md.trim();

  // Tables
  html = html.replace(/^\|(.+)\|$/gm, (match) => {
    return match;
  });
  const lines = html.split('\n');
  let inTable = false;
  let tableHtml = '';
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableHtml = '<table><thead><tr>';
        const cells = line.split('|').filter(c => c.trim());
        cells.forEach(c => tableHtml += `<th>${c.trim()}</th>`);
        tableHtml += '</tr></thead>';
        continue;
      }
      if (line.match(/^\|[\s\-|]+\|$/)) {
        tableHtml += '<tbody>';
        continue;
      }
      tableHtml += '<tr>';
      const cells = line.split('|').filter(c => c.trim());
      cells.forEach(c => tableHtml += `<td>${c.trim()}</td>`);
      tableHtml += '</tr>';
    } else {
      if (inTable) {
        tableHtml += '</tbody></table>';
        result.push(tableHtml);
        inTable = false;
        tableHtml = '';
      }
      result.push(line);
    }
  }
  if (inTable) {
    tableHtml += '</tbody></table>';
    result.push(tableHtml);
  }
  html = result.join('\n');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>');

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr>');

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Paragraphs - wrap remaining text lines
  html = html.replace(/^(?!<[a-z])((?!<).+)$/gm, '<p>$1</p>');

  // Clean empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}
