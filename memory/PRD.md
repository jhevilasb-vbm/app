# VBM GESTÃO 3D — PRD

## Problema original
Aplicativo completo (pt-BR, R$) para gerir a VBM 3D (impressão 3D, Bambu Lab A1 e A1 Mini): dashboard, calculadora profissional de orçamentos (margem x markup, taxas sobre a venda), clientes/CRM, pedidos/vendas, produção 3D, catálogo com ficha técnica e fotos, estoque, compras/fornecedores, financeiro completo, relatórios, configurações/premissas, login para 2 pessoas, auditoria, dados demo removíveis.

## Escolhas do usuário
- Login JWT, 2 contas: jhevilasb@gmail.com e bh.nascimento@hotmail.com (senha inicial Vbm3d@2026)
- Todos os módulos na 1ª versão; upload de fotos (Emergent Object Storage)

## Arquitetura
- Backend FastAPI único (/app/backend/server.py), MongoDB, ids uuid, exclusão lógica, audit_logs
- Cálculo de preço no servidor (POST /api/calc) – fonte única das fórmulas
- Frontend Expo Router: tabs (Início, Orçamentos, Pedidos, Mais) + telas de módulos; formulário genérico (/form?col=)
- Tema escuro com destaques âmbar (src/theme.ts)

## Implementado (2026-10)
- Auth JWT + bloqueio após 5 tentativas, troca de nome/senha
- Calculadora: 18 itens transparentes, margem vs markup, desperdício sobre material ou custo, rateio de fixos, comparação A1 x Mini, simulação de preço, salvar premissas padrão, avisos de valores não cadastrados
- Orçamentos: itens via calculadora, snapshot de custos/premissas, PDF, copiar texto para WhatsApp, conversão em pedido (uma vez)
- Pedidos: canais, taxas separadas (descontadas ou como conta a pagar), pagamentos parciais, parcelas a receber, status, baixa de acabados na entrega, geração de trabalhos de produção
- Produção: fila por impressora, previsão de início/fim, distribuição automática, iniciar/finalizar com peso real, baixa única de filamento e ficha técnica, perdas, entrada no estoque de acabados
- Estoque: tipos, movimentações (entrada/saída/ajuste/desperdício), custo médio, bloqueio de negativo com confirmação, compra automática ao atingir o mínimo
- Compras: sugestões (mínimo + pedidos confirmados), status planejado→recebido, uma única despesa, entrada no estoque
- Financeiro: saldo (apenas efetivo), vencidas, 7/15/30 dias, a receber, fluxo projetado, necessidade de caixa, parceladas/recorrentes, aportes/retiradas, empresa x pessoal, conciliação, DRE sem dupla contagem (categorias "já no custo")
- Relatórios com filtros, exportação CSV e PDF; histórico de alterações; dados demo [DEMO]
- Testes: backend 29/29, frontend com fluxos críticos aprovados

## Backlog
- P1: Seletor de datas nativo, fotos do produto no orçamento em PDF, recorrência automática contínua
- P1: Agenda visual (linha do tempo) da produção
- P2: Integração Bambu Lab (se viável), múltiplas contas bancárias, metas mensais
