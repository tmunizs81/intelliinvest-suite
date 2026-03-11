import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface DeletedTransaction {
  id: string;
  data: any;
  timeout: ReturnType<typeof setTimeout>;
}

export function useUndoTransaction() {
  const { user } = useAuth();
  const pendingRef = useRef<Map<string, DeletedTransaction>>(new Map());

  const deleteWithUndo = useCallback(async (
    transactionId: string,
    onComplete?: () => void,
  ) => {
    if (!user) return;

    // Fetch transaction data before deleting
    const { data: txn } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('user_id', user.id)
      .single();

    if (!txn) return;

    // Soft delete: actually delete
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', transactionId)
      .eq('user_id', user.id);

    if (error) {
      toast.error('Erro ao excluir transação');
      return;
    }

    // Set timeout for permanent deletion (no further action needed since already deleted)
    const timeout = setTimeout(() => {
      pendingRef.current.delete(transactionId);
    }, 10000);

    pendingRef.current.set(transactionId, { id: transactionId, data: txn, timeout });

    toast('Transação excluída', {
      description: `${txn.ticker} - ${txn.operation === 'buy' ? 'Compra' : 'Venda'} de ${txn.quantity}un`,
      action: {
        label: 'Desfazer',
        onClick: async () => {
          clearTimeout(timeout);
          pendingRef.current.delete(transactionId);

          // Re-insert the transaction
          const { id, created_at, updated_at, ...insertData } = txn;
          await supabase.from('transactions').insert(insertData);
          toast.success('Transação restaurada!');
          onComplete?.();
        },
      },
      duration: 10000,
    });

    onComplete?.();
  }, [user]);

  return { deleteWithUndo };
}
