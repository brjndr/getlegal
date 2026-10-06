import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = {
  title: "Create an account",
};

export default function SignUp() {
  return <AuthForm mode="sign-up" />;
}
