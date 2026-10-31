import {
  body,
  checkOrigin,
  errorResponse,
  HttpError,
  requireUser,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { isAccentColor } from "@/lib/personal-palette";
import { noStore } from "@/lib/admin-query";
export async function GET() {
  try {
    const user = await requireUser();
    if (user.accountRole === "guest")
      throw new HttpError(403, "게스트는 설정을 조회할 수 없습니다.");
    const row = (
      await db().execute({
        sql: "SELECT toast_position AS toastPosition,default_theme AS defaultTheme,toast_background_color AS toastBackgroundColor,toast_font_color AS toastFontColor,accent_color AS accentColor,toast_close_button_color AS toastCloseButtonColor,toast_close_button_background_color AS toastCloseButtonBackgroundColor,version FROM user_preferences WHERE user_id=?",
        args: [user.id],
      })
    ).rows[0];
    return Response.json(
      row ?? {
        toastPosition: "bottom",
        defaultTheme: "light",
        toastBackgroundColor: "#ffffff",
        toastFontColor: "#262138",
        toastCloseButtonColor: null,
        toastCloseButtonBackgroundColor: null,
        accentColor: null,
        version: 0,
      },
      noStore,
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    if (user.accountRole === "guest")
      throw new HttpError(403, "게스트는 저장할 수 없습니다.");
    const input = await body(request);
    if (
      Object.keys(input).some(
        (k) =>
          ![
            "toastPosition",
            "defaultTheme",
            "toastBackgroundColor",
            "toastFontColor",
            "toastCloseButtonColor",
            "toastCloseButtonBackgroundColor",
            "accentColor",
            "version",
          ].includes(k),
      ) ||
      (["toastCloseButtonColor", "toastCloseButtonBackgroundColor"].some((key) => input[key] !== undefined && !isAccentColor(input[key]))) ||
      (input.accentColor !== undefined && !isAccentColor(input.accentColor)) ||
      !Number.isSafeInteger(input.version) ||
      Number(input.version) < 0 ||
      (input.toastPosition !== undefined &&
        (typeof input.toastPosition !== "string" ||
          !["top", "bottom"].includes(input.toastPosition))) ||
      (input.defaultTheme !== undefined &&
        (typeof input.defaultTheme !== "string" ||
          !["light", "dark"].includes(input.defaultTheme))) ||
      (input.toastBackgroundColor !== undefined &&
        (typeof input.toastBackgroundColor !== "string" ||
          !/^#[0-9a-fA-F]{6}$/.test(input.toastBackgroundColor))) ||
      (input.toastFontColor !== undefined &&
        (typeof input.toastFontColor !== "string" ||
          !/^#[0-9a-fA-F]{6}$/.test(input.toastFontColor)))
    )
      throw new HttpError(400, "설정 값과 버전을 확인해 주세요.");
    const tx = await db().transaction("write");
    try {
      const row = (
        await tx.execute({
          sql: "SELECT * FROM user_preferences WHERE user_id=?",
          args: [user.id],
        })
      ).rows[0];
      if (Number(row?.version ?? 0) !== input.version)
        throw new HttpError(
          409,
          "설정이 변경되었습니다. 새로고침 후 다시 저장해 주세요.",
        );
      const toastPosition = String(
          input.toastPosition ?? row?.toast_position ?? "bottom",
        ),
        defaultTheme = String(
          input.defaultTheme ?? row?.default_theme ?? "light",
        ),
        toastBackgroundColor = String(
          input.toastBackgroundColor ??
            row?.toast_background_color ??
            "#ffffff",
        ),
        toastFontColor = String(
          input.toastFontColor ?? row?.toast_font_color ?? "#262138",
        ),
        toastCloseButtonColor = input.toastCloseButtonColor === undefined ? row?.toast_close_button_color ?? null : input.toastCloseButtonColor === null ? null : String(input.toastCloseButtonColor).toLowerCase(),
        toastCloseButtonBackgroundColor = input.toastCloseButtonBackgroundColor === undefined ? row?.toast_close_button_background_color ?? null : input.toastCloseButtonBackgroundColor === null ? null : String(input.toastCloseButtonBackgroundColor).toLowerCase(),
        accentColor = input.accentColor === undefined ? row?.accent_color ?? null : input.accentColor === null ? null : String(input.accentColor).toLowerCase(),
        version = Number(input.version) + 1;
      await tx.execute({
        sql: "INSERT INTO user_preferences(user_id,toast_position,default_theme,toast_background_color,toast_font_color,accent_color,toast_close_button_color,toast_close_button_background_color,version) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET toast_position=excluded.toast_position,default_theme=excluded.default_theme,toast_background_color=excluded.toast_background_color,toast_font_color=excluded.toast_font_color,accent_color=excluded.accent_color,toast_close_button_color=excluded.toast_close_button_color,toast_close_button_background_color=excluded.toast_close_button_background_color,version=excluded.version,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        args: [
          user.id,
          toastPosition,
          defaultTheme,
          toastBackgroundColor,
          toastFontColor,
          accentColor,
          toastCloseButtonColor,
          toastCloseButtonBackgroundColor,
          version,
        ],
      });
      await tx.commit();
      return Response.json(
        {
          toastPosition,
          defaultTheme,
          toastBackgroundColor,
          toastFontColor,
          accentColor,
          toastCloseButtonColor,
          toastCloseButtonBackgroundColor,
          version,
        },
        noStore,
      );
    } catch (e) {
      await tx.rollback();
      throw e;
    } finally {
      tx.close();
    }
  } catch (e) {
    return errorResponse(e);
  }
}
