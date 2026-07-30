"use client";

import * as React from "react";
import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { CheckCircle2, Info, LoaderCircle, TriangleAlert, X, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export const toast = ToastPrimitive.createToastManager();

const iconByType = {
  success: CheckCircle2,
  info: Info,
  warning: TriangleAlert,
  error: XCircle,
  loading: LoaderCircle,
};

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();

  return toasts.map((item) => {
    const Icon = iconByType[item.type] || Info;
    return (
      <ToastPrimitive.Root
        key={item.id}
        toast={item}
        swipeDirection="right"
        className={cn(
          "pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-xl border border-line bg-card px-4 py-3 text-text shadow-xl",
          "transition-[transform,opacity] duration-200 data-[starting-style]:translate-x-full data-[starting-style]:opacity-0 data-[ending-style]:translate-x-full data-[ending-style]:opacity-0",
        )}
      >
        <Icon
          className={cn(
            "mt-0.5 size-5 shrink-0 text-muted",
            item.type === "success" && "text-good",
            item.type === "warning" && "text-amber-500",
            item.type === "error" && "text-bad",
            item.type === "loading" && "animate-spin text-brand",
          )}
        />
        <ToastPrimitive.Content className="min-w-0 flex-1">
          {item.title ? <ToastPrimitive.Title className="text-sm font-bold">{item.title}</ToastPrimitive.Title> : null}
          {item.description ? (
            <ToastPrimitive.Description className="mt-0.5 text-xs leading-5 text-muted">
              {item.description}
            </ToastPrimitive.Description>
          ) : null}
          {item.actionProps ? (
            <ToastPrimitive.Action
              {...item.actionProps}
              className={cn("mt-2 rounded-md border border-line px-2.5 py-1 text-xs font-semibold", item.actionProps.className)}
            />
          ) : null}
        </ToastPrimitive.Content>
        <ToastPrimitive.Close
          aria-label="Close notification"
          className="shrink-0 rounded-md p-1 text-muted transition hover:bg-chipbg hover:text-text"
        >
          <X className="size-4" />
        </ToastPrimitive.Close>
      </ToastPrimitive.Root>
    );
  });
}

export function Toaster() {
  return (
    <ToastPrimitive.Provider toastManager={toast} timeout={4500} limit={4}>
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport className="pointer-events-none fixed right-0 top-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-4 sm:top-auto sm:bottom-0">
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  );
}
