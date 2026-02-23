import { redirect } from "next/navigation";

import { requireManifestoUser } from "@/lib/auth-guards";

export default async function SubmitPageRedirect() {
  await requireManifestoUser();
  redirect("/");
}
