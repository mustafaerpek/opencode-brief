import { Schema } from "effect"
import { Plugin, Store } from "@opencode/plugin/gui"

const Prefs = Schema.Struct({
  includeCommands: Schema.Boolean,
  includeTests: Schema.Boolean,
})

export const definition = Plugin.define({
  stores: {
    prefs: Store.global(Prefs, {
      includeCommands: true,
      includeTests: true,
    }),
  },
  i18n: {
    en: {
      "command.open": "Handoff: Open brief",
      "command.open.description": "Turn this session into a reviewable handoff brief",
      "panel.title": "Brief",
      "panel.generate": "Generate",
      "panel.copy": "Copy",
      "panel.save": "Save",
      "panel.insert": "Insert",
      "panel.empty": "Generate a brief to see what changed, what ran, and what is left.",
      "panel.error": "The brief could not be generated.",
      "settings.title": "Handoff",
      "settings.commands": "Include shell commands",
      "settings.commands.description": "List commands other than tests in the brief.",
      "settings.tests": "Include verification",
      "settings.tests.description": "List test, typecheck, and lint commands with their exit status.",
      "settings.note": "This version builds the brief from session messages and the working diff without calling a model.",
      "toast.copied": "Brief copied",
      "toast.saved": "Brief saved",
    },
    tr: {
      "command.open": "Handoff: Brief'i aç",
      "command.open.description": "Bu oturumu incelenebilir bir devir özetine çevir",
      "panel.title": "Brief",
      "panel.generate": "Oluştur",
      "panel.copy": "Kopyala",
      "panel.save": "Kaydet",
      "panel.insert": "Prompt'a ekle",
      "panel.empty": "Neyin değiştiğini, neyin çalıştığını ve neyin kaldığını görmek için bir brief oluştur.",
      "panel.error": "Brief oluşturulamadı.",
      "settings.title": "Handoff",
      "settings.commands": "Shell komutlarını ekle",
      "settings.commands.description": "Test dışındaki komutları brief içinde listele.",
      "settings.tests": "Doğrulamayı ekle",
      "settings.tests.description": "Test, typecheck ve lint komutlarını çıkış durumlarıyla listele.",
      "settings.note": "Bu sürüm brief'i model çağırmadan, oturum mesajlarından ve çalışma diff'inden oluşturur.",
      "toast.copied": "Brief kopyalandı",
      "toast.saved": "Brief kaydedildi",
    },
  },
})
