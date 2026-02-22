"use server";

import { signIn, signOut } from "@/auth";

export const signInWithGoogleAction = async (): Promise<void> => {
  await signIn("google", {
    redirectTo: "/manifesto",
  });
};

export const signInWithGithubAction = async (): Promise<void> => {
  await signIn("github", {
    redirectTo: "/manifesto",
  });
};

export const signOutAction = async (): Promise<void> => {
  await signOut({
    redirectTo: "/",
  });
};
