"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Lock } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function LockedPage() {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ pin: string }>();

  async function onSubmit(values: { pin: string }) {
    setServerError(null);
    try {
      await api("/api/auth/unlock", { method: "POST", body: values });
      router.replace("/");
      router.refresh();
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : "אירעה שגיאה");
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="p-6 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-warn-bg text-warn">
            <Lock className="h-7 w-7" aria-hidden />
          </span>
          <h1 className="text-xl font-bold">המסך נעול</h1>
          <p className="mb-6 mt-1 text-sm text-muted">הזן קוד PIN לחזרה מהירה, או התחבר מחדש</p>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 text-start">
            <div>
              <Label htmlFor="pin">קוד PIN</Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                autoFocus
                dir="ltr"
                maxLength={8}
                autoComplete="off"
                {...register("pin", {
                  required: "יש להזין קוד PIN",
                  pattern: { value: /^\d{4,8}$/, message: "קוד PIN — 4 עד 8 ספרות" },
                })}
              />
              <FieldError>{errors.pin?.message}</FieldError>
            </div>
            {serverError && (
              <p role="alert" className="rounded-lg bg-debt-bg p-3 text-sm font-medium text-debt">
                {serverError}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
              שחרור נעילה
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={async () => {
                await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
                router.replace("/login");
              }}
            >
              התחברות מחדש עם סיסמה
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
