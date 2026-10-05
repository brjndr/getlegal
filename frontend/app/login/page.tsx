import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = {
  title: "Sign in to Prelegal",
};

export default function Login() {
  return <LoginForm />;
}
