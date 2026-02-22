import { NextResponse } from "next/server";

import { auth } from "@/auth";

const protectedRoots = ["/feed", "/submit", "/profile", "/matching"];

export default auth((request) => {
  const path = request.nextUrl.pathname;
  const isProtected = protectedRoots.some((root) => path === root || path.startsWith(`${root}/`));
  const sessionUser = request.auth?.user;

  if (!isProtected) {
    return NextResponse.next();
  }

  if (!sessionUser) {
    const loginUrl = new URL("/", request.nextUrl);
    loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  if (!sessionUser.manifestoAcceptedAt) {
    return NextResponse.redirect(new URL("/manifesto", request.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/feed/:path*", "/submit/:path*", "/profile/:path*", "/matching/:path*"],
};
