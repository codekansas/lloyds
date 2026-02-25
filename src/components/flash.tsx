import type { ReactNode } from "react";

type FlashProps = {
  message: ReactNode;
  tone?: "info" | "success" | "error";
};

export const Flash = ({ message, tone = "info" }: FlashProps) => {
  return <p className={`flash flash-${tone}`}>{message}</p>;
};
