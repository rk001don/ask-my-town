import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CancelOrderDialogProps = {
  open: boolean;
  orderId: string | null;
  defaultReason?: string;
  reasonOptional?: boolean;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void | Promise<void>;
};

export function CancelOrderDialog({
  open,
  orderId,
  defaultReason = "",
  reasonOptional = false,
  busy = false,
  onOpenChange,
  onConfirm,
}: CancelOrderDialogProps) {
  const [reason, setReason] = useState(defaultReason);

  useEffect(() => {
    if (open) setReason(defaultReason);
  }, [defaultReason, open]);

  const trimmedReason = reason.trim();
  const canSubmit = reasonOptional || trimmedReason.length >= 3;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-2xl border-[color:var(--border-strong)] bg-[color:var(--bg-elevated)] p-5">
        <DialogHeader className="pr-8 text-left">
          <div className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-[color:var(--danger)]/15 text-[color:var(--danger)]">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle>Cancel order?</DialogTitle>
          <DialogDescription>
            {orderId
              ? `${orderId} will be cancelled and cannot be resumed.`
              : "This order will be cancelled."}
          </DialogDescription>
        </DialogHeader>
        <div>
          <label htmlFor="cancel-reason" className="text-sm font-semibold">
            Reason{" "}
            {reasonOptional ? (
              <span className="font-normal text-muted-foreground">(optional)</span>
            ) : null}
          </label>
          <textarea
            id="cancel-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={240}
            autoFocus
            placeholder="Tell us why this order is being cancelled"
            className="mt-2 w-full resize-none rounded-xl border border-[color:var(--border-strong)] bg-[color:var(--bg-elevated-2)] p-3 text-sm outline-none focus:border-[color:var(--accent-primary)]"
          />
        </div>
        <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Keep order
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || !canSubmit}
            onClick={() => void onConfirm(trimmedReason)}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            Cancel order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
