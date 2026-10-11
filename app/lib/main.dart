import 'package:flutter/material.dart';
import 'package:flutter_web_plugins/url_strategy.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';
import 'data/diagnostics.dart';
import 'data/people.dart';
import 'data/safe_area.dart';
import 'router.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  usePathUrlStrategy();
  await Supabase.initialize(url: Config.supabaseUrl, publishableKey: Config.supabaseKey);
  // Which person is open is known before the first screen loads anything.
  Supabase.instance.client.auth.onAuthStateChange.listen((s) {
    if (s.event == AuthChangeEvent.signedIn || s.event == AuthChangeEvent.signedOut || s.event == AuthChangeEvent.initialSession) {
      people.load();
    }
  });
  if (Supabase.instance.client.auth.currentSession != null) {
    await people.ready().timeout(const Duration(seconds: 4), onTimeout: () {});
  }
  initSafeArea();
  Diagnostics.init(route: () => router.routerDelegate.currentConfiguration.uri.toString());
  runApp(const ImmiInsightApp());
}

class ImmiInsightApp extends StatelessWidget {
  const ImmiInsightApp({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = buildTheme();
    return ShadApp.router(
      title: 'Immi Insight',
      locale: const Locale('en', 'AU'),
      supportedLocales: const [Locale('en', 'AU'), Locale('en', 'US')],
      routerConfig: router,
      theme: theme,
      darkTheme: theme,
      themeMode: ThemeMode.dark,
      backgroundColor: AppColors.bg,
      materialThemeBuilder: (context, t) => t.copyWith(
        visualDensity: VisualDensity.compact,
        scaffoldBackgroundColor: AppColors.bg,
        splashFactory: NoSplash.splashFactory,
        highlightColor: Colors.transparent,
      ),
    );
  }
}
