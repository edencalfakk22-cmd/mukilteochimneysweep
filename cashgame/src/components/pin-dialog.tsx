"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";

interface PinForm {
  currentPassword: string;
  pin: string;
}

/** Set a personal PIN for quick unlock on this account. */
export function PinDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  // react-hook-form state is reset on successful save; the dialog remounts per open via key.
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PinForm>();
  const [serverError, setServerError] = React.useState<string | null>(null);

  async function onSubmit(values: PinForm) {
    setServerError(null);
    try {
      await api("/api/auth/pin", { method: "POST", body: values });
      toast.success("קוד ה־PIN עודכן");
      reset();
      onOpenChange(false);
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : "אירעה שגיאה");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="הגדרת קוד PIN" description="קוד קצר לשחרור מהיר של נעילת מסך במכשיר זה">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <Label htmlFor="currentPassword">סיסמה נוכחית</Label>
            <Input
              id="currentPassword"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              {...register("currentPassword", { required: "יש להזין את הסיסמה הנוכחית" })}
            />
            <FieldError>{errors.currentPassword?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="newPin">קוד PIN חדש (4–8 ספרות)</Label>
            <Input
              id="newPin"
              type="password"
              inputMode="numeric"
              dir="ltr"
              maxLength={8}
              autoComplete="off"
              {...register("pin", {
                required: "יש להזין קוד PIN",
                pattern: { value: /^\d{4,8}$/, message: "4 עד 8 ספרות בלבד" },
              })}
            />
            <FieldError>{errors.pin?.message}</FieldError>
          </div>
          {serverError && (
            <p role="alert" className="rounded-lg bg-debt-bg p-3 text-sm font-medium text-debt">
              {serverError}
            </p>
          )}
          <Button type="submit" className="w-full" loading={isSubmitting}>
            שמירת PIN
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
