import 'package:flutter/material.dart';
import 'package:flutter_web_plugins/url_strategy.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';
import 'router.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  usePathUrlStrategy();
  await Supabase.initialize(url: Config.supabaseUrl, publishableKey: Config.supabaseKey);
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
