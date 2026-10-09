import 'package:animations/animations.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// One motion vocabulary for the whole app.
class Motion {
  static const fast = Duration(milliseconds: 160);
  static const medium = Duration(milliseconds: 280);
  static const slow = Duration(milliseconds: 460);

  /// Quick start, long soft settle: feels like a spring without overshoot.
  static const ease = Cubic(0.22, 1, 0.36, 1);
  static const emphasized = Cubic(0.2, 0, 0, 1);
}

/// Material "shared axis" slide+fade for forward/back flows (onboarding → auth).
CustomTransitionPage<void> sharedAxisPage(
  GoRouterState state,
  Widget child, {
  SharedAxisTransitionType type = SharedAxisTransitionType.horizontal,
}) {
  return CustomTransitionPage<void>(
    key: state.pageKey,
    child: child,
    transitionDuration: Motion.slow,
    reverseTransitionDuration: Motion.medium,
    transitionsBuilder: (context, animation, secondary, child) => SharedAxisTransition(
      animation: animation,
      secondaryAnimation: secondary,
      transitionType: type,
      fillColor: Colors.transparent,
      child: child,
    ),
  );
}

/// "Fade through" for switching between top-level tabs.
CustomTransitionPage<void> fadeThroughPage(GoRouterState state, Widget child) {
  return CustomTransitionPage<void>(
    key: state.pageKey,
    child: child,
    transitionDuration: Motion.medium,
    transitionsBuilder: (context, animation, secondary, child) =>
        FadeThroughTransition(animation: animation, secondaryAnimation: secondary, fillColor: Colors.transparent, child: child),
  );
}
