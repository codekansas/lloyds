import { NextResponse } from "next/server";

import { auth } from "@/auth";

const protectedRoots = ["/profile"];

export default auth((request) => {
  const path = request.nextUrl.pathname;
  const isProtectedCommentPath = /^\/feed\/[^/]+\/comments(?:\/.*)?$/.test(path);
  const isProtected = isProtectedCommentPath || protectedRoots.some((root) => path === root || path.startsWith(`${root}/`));
  const sessionUser = request.auth?.user;

  if (!isProtected) {
    return NextResponse.next();
  }

  if (!sessionUser) {
    const loginUrl = new URL("/", request.nextUrl);
    loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  if (sessionUser.accountBannedAt) {
    return NextResponse.redirect(new URL("/banned", request.nextUrl));
  }

  if (!sessionUser.manifestoAcceptedAt) {
    return NextResponse.redirect(new URL("/manifesto", request.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/feed/:path*", "/profile/:path*"],
};
