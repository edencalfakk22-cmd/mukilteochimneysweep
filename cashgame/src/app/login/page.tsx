"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Coins } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface LoginForm {
  username: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>();

  async function onSubmit(values: LoginForm) {
    setServerError(null);
    try {
      await api("/api/auth/login", { method: "POST", body: values });
      toast.success("התחברת בהצלחה");
      router.replace("/");
      router.refresh();
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : "אירעה שגיאה");
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="p-6">
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white">
              <Coins className="h-7 w-7" aria-hidden />
            </span>
            <h1 className="text-2xl font-bold">ניהול קופה</h1>
            <p className="text-sm text-muted">מערכת ניהול משחקי קלפים פרטיים</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <Label htmlFor="username">שם משתמש</Label>
              <Input
                id="username"
                autoComplete="username"
                autoFocus
                dir="ltr"
                {...register("username", { required: "יש להזין שם משתמש" })}
              />
              <FieldError>{errors.username?.message}</FieldError>
            </div>
            <div>
              <Label htmlFor="password">סיסמה</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                dir="ltr"
                {...register("password", { required: "יש להזין סיסמה" })}
              />
              <FieldError>{errors.password?.message}</FieldError>
            </div>
            {serverError && (
              <p role="alert" className="rounded-lg bg-debt-bg p-3 text-sm font-medium text-debt">
                {serverError}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
              התחברות
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
