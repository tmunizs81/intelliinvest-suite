#!/usr/bin/env bash
# Verifica que todas as Edge Functions usam apenas api.deepseek.com
# Uso: bash scripts/verify-deepseek-only.sh
set -euo pipefail

DIR="supabase/functions"
FORBIDDEN='ai\.gateway\.lovable|LOVABLE_API_KEY|GEMINI_API_KEY|GROQ_API_KEY|OPENROUTER_API_KEY|api\.groq\.com|generativelanguage\.googleapis|openrouter\.ai'

echo "🔍 Verificando Edge Functions em $DIR..."
if grep -rEn "$FORBIDDEN" "$DIR" 2>/dev/null; then
  echo "❌ Referências proibidas encontradas acima. Somente api.deepseek.com é permitido."
  exit 1
fi

# Toda função que chama IA deve referenciar deepseek
AI_FUNCS=$(grep -rl "chat/completions\|DEEPSEEK_API_KEY" "$DIR" 2>/dev/null || true)
BAD=0
for f in $AI_FUNCS; do
  if ! grep -q "api.deepseek.com" "$f"; then
    echo "⚠️  $f usa chat/completions mas não aponta para api.deepseek.com"
    BAD=1
  fi
done
[ "$BAD" = "1" ] && exit 1

echo "✅ Todas as Edge Functions usam exclusivamente api.deepseek.com"
