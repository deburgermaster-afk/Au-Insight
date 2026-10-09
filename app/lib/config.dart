/// Build-time configuration. Override with --dart-define, e.g.
/// flutter build web --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_KEY=...
class Config {
  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL', defaultValue: 'https://rzwntsessjeofmhwudhe.supabase.co');

  /// Publishable key: safe in the browser; row-level security protects the data.
  static const supabaseKey = String.fromEnvironment('SUPABASE_KEY', defaultValue: 'sb_publishable_hkd8Y3eV1g4Rg6c7WHwx9w_Q6MVBH7m');

  /// Supabase email code length (6 by default; configurable 6–10 in Auth settings).
  static const otpLength = int.fromEnvironment('OTP_LENGTH', defaultValue: 6);

  static String get chatUrl => '$supabaseUrl/functions/v1/chat';
}
