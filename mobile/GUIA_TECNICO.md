# DataSync Field — Guia do Técnico

## Instalação do aplicativo

### Via Firebase App Distribution
1. Você receberá um e-mail do Firebase com o link de download
2. Abra o link no celular Android
3. Se pedido, instale o aplicativo **Firebase App Tester** primeiro
4. Depois instale o **DataSync Field** normalmente

### Permitir instalação de fontes desconhecidas (Android)
Caso o sistema bloqueie a instalação:
1. Vá em **Configurações → Segurança**
2. Ative **Fontes desconhecidas** (ou "Instalar apps desconhecidos")
3. Tente instalar novamente

---

## Primeiro acesso e permissões

Ao fazer login pela primeira vez, o app pedirá três permissões. **Todas são necessárias** para o funcionamento dos alertas.

### 1. Localização em background
- Selecione **"Permitir sempre"** (não apenas quando o app estiver aberto)
- Isso permite que o app detecte máquinas próximas mesmo com a tela desligada

### 2. Notificações
- Toque em **"Permitir"**
- Sem isso você não receberá os alertas de máquinas pendentes

### 3. Localização em foreground
- Necessária para registrar suas visitas corretamente

---

## Como funcionam os alertas

O DataSync Field verifica sua localização a cada **15 minutos** em segundo plano.

Quando você estiver a menos de **5 km** de uma fazenda com máquinas offline pendentes, você receberá uma notificação como:

> **🚨 Máquinas para coletar!**
> Você está próximo de Fazenda São João - 3 máquina(s) pendente(s) a 2.4km

Ao tocar na notificação, o app abrirá direto na lista de máquinas daquela fazenda.

---

## Solução de problemas

### Não estou recebendo alertas
1. Verifique se a **localização em background** está habilitada:
   - Configurações → Apps → DataSync Field → Permissões → Localização → **Permitir sempre**
2. Verifique se as **notificações** estão ativas:
   - Configurações → Apps → DataSync Field → Notificações → Ativar
3. Verifique se o modo **"Economia de bateria"** não está bloqueando o app:
   - Configurações → Bateria → Otimização de bateria → DataSync Field → **Não otimizar**

### App não abre ao tocar na notificação
- Force o encerramento do app e abra novamente
- Faça login com seu ID de funcionário

### Erro de login
- Confirme que seu ID está no formato `x000000` (letra x + 6 números)
- Verifique se há conexão com internet (WiFi ou dados móveis)

---

## Suporte

Em caso de problemas, entre em contato com o suporte técnico Sincronus:
- **E-mail:** atendimento@sincronus.com.br
- Informe seu **ID de funcionário** e o modelo do celular

---

*DataSync Field v1.0 — Sincronus © 2024*
