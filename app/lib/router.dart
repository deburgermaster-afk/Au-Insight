import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'motion.dart';
import 'screens/ask/ask_screen.dart';
import 'screens/assess/assess_screen.dart';
import 'screens/auth/auth_screens.dart';
import 'screens/documents/documents_screen.dart';
import 'screens/onboarding.dart';
import 'screens/shell.dart';
import 'screens/sources/sources_screen.dart';

/// Re-runs the router's redirect whenever the auth session changes.
class _AuthRefresh extends ChangeNotifier {
  _AuthRefresh() {
    _sub = Supabase.instance.client.auth.onAuthStateChange.listen((_) => notifyListeners());
  }
  late final StreamSubscription<AuthState> _sub;

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}

const _publicPaths = {'/welcome', '/sign-in', '/sign-up', '/verify', '/forgot', '/reset'};

final router = GoRouter(
  initialLocation: '/ask',
  refreshListenable: _AuthRefresh(),
  redirect: (context, state) {
    final signedIn = Supabase.instance.client.auth.currentSession != null;
    final path = state.uri.path;
    final public = _publicPaths.contains(path);
    if (!signedIn && !public) return '/welcome';
    // /reset stays reachable while signed in: verifying the recovery code signs the user in.
    if (signedIn && public && path != '/reset') return '/ask';
    return null;
  },
  routes: [
    GoRoute(path: '/welcome', pageBuilder: (c, s) => sharedAxisPage(s, const OnboardingScreen())),
    GoRoute(path: '/sign-in', pageBuilder: (c, s) => sharedAxisPage(s, const SignInScreen())),
    GoRoute(path: '/sign-up', pageBuilder: (c, s) => sharedAxisPage(s, const SignUpScreen())),
    GoRoute(
      path: '/verify',
      pageBuilder: (c, s) => sharedAxisPage(s, VerifyScreen(email: s.uri.queryParameters['email'] ?? '')),
    ),
    GoRoute(
      path: '/forgot',
      pageBuilder: (c, s) => sharedAxisPage(s, ForgotScreen(email: s.uri.queryParameters['email'] ?? '')),
    ),
    GoRoute(
      path: '/reset',
      pageBuilder: (c, s) => sharedAxisPage(s, ResetScreen(email: s.uri.queryParameters['email'] ?? '')),
    ),
    StatefulShellRoute(
      pageBuilder: (c, s, shell) => fadeThroughPage(s, AppShell(shell: shell)),
      navigatorContainerBuilder: (context, shell, children) => AnimatedBranches(index: shell.currentIndex, children: children),
      branches: [
        StatefulShellBranch(
          routes: [GoRoute(path: '/ask', builder: (c, s) => const AskScreen())],
        ),
        StatefulShellBranch(
          routes: [GoRoute(path: '/assess', builder: (c, s) => const AssessScreen())],
        ),
        StatefulShellBranch(
          routes: [GoRoute(path: '/documents', builder: (c, s) => const DocumentsScreen())],
        ),
        StatefulShellBranch(
          routes: [GoRoute(path: '/sources', builder: (c, s) => const SourcesScreen())],
        ),
      ],
    ),
  ],
);

/// Keeps every tab alive (state preserved) and cross-fades + lifts between them.
class AnimatedBranches extends StatelessWidget {
  const AnimatedBranches({super.key, required this.index, required this.children});
  final int index;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        for (final (i, child) in children.indexed)
          IgnorePointer(
            ignoring: i != index,
            child: TickerMode(
              enabled: i == index,
              child: AnimatedOpacity(
                opacity: i == index ? 1 : 0,
                duration: Motion.medium,
                curve: Motion.ease,
                child: AnimatedScale(
                  scale: i == index ? 1 : 0.985,
                  duration: Motion.slow,
                  curve: Motion.ease,
                  child: AnimatedSlide(
                    offset: i == index ? Offset.zero : const Offset(0, 0.012),
                    duration: Motion.slow,
                    curve: Motion.ease,
                    child: child,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
