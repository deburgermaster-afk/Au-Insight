import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../config.dart';
import '../../motion.dart';
import '../../theme.dart';
import '../../widgets/common.dart';

SupabaseClient get _sb => Supabase.instance.client;
const _minPassword = 8;

void toast(BuildContext context, String message, {bool error = false}) {
  ShadToaster.of(context).show(error ? ShadToast.destructive(description: Text(message)) : ShadToast(description: Text(message)));
}

String authMessage(Object e) {
  final m = e is AuthException ? e.message : e.toString();
  if (RegExp('invalid login credentials', caseSensitive: false).hasMatch(m)) return 'Email or password is incorrect.';
  if (RegExp(r'expired|invalid.*(otp|token)', caseSensitive: false).hasMatch(m)) {
    return 'That code is invalid or has expired. Request a new one.';
  }
  if (RegExp('rate limit|too many', caseSensitive: false).hasMatch(m)) return 'Too many attempts. Wait a minute and try again.';
  return m;
}

/// Shared layout: back link, big heading, staggered fields, optional footer.
class AuthShell extends StatelessWidget {
  const AuthShell({super.key, required this.back, required this.title, this.subtitle, required this.children, this.footer});
  final String back;
  final String title;
  final Widget? subtitle;
  final List<Widget> children;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SizedBox(
                    height: 40,
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Pressable(
                        onTap: () => context.go(back),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(LucideIcons.chevronLeft, size: 15, color: AppColors.muted),
                            Text('Back', style: AppText.small),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: SingleChildScrollView(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const SizedBox(height: 18),
                          Text(title, style: AppText.display.copyWith(fontSize: 28)).enter(0),
                          if (subtitle != null) ...[
                            const SizedBox(height: 8),
                            DefaultTextStyle(style: AppText.small.copyWith(fontSize: 12.5), child: subtitle!).enter(1),
                          ],
                          const SizedBox(height: 22),
                          for (final (i, c) in children.indexed) Padding(padding: const EdgeInsets.only(bottom: 9), child: c.enter(i + 2)),
                        ],
                      ),
                    ),
                  ),
                  if (footer != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16, top: 8),
                      child: Center(child: footer!),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class Field extends StatelessWidget {
  const Field({
    super.key,
    required this.icon,
    required this.placeholder,
    required this.controller,
    this.obscure = false,
    this.email = false,
    this.onSubmitted,
  });
  final IconData icon;
  final String placeholder;
  final TextEditingController controller;
  final bool obscure;
  final bool email;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return ShadInput(
      controller: controller,
      placeholder: Text(placeholder),
      obscureText: obscure,
      keyboardType: email ? TextInputType.emailAddress : null,
      autofillHints: email
          ? const [AutofillHints.email]
          : obscure
          ? const [AutofillHints.password]
          : null,
      leading: Padding(
        padding: const EdgeInsets.only(right: 4),
        child: Icon(icon, size: 15, color: AppColors.muted),
      ),
      style: AppText.body,
      onSubmitted: onSubmitted,
      decoration: ShadDecoration(
        color: AppColors.surface,
        border: ShadBorder.all(color: Colors.transparent, radius: BorderRadius.circular(12)),
        focusedBorder: ShadBorder.all(color: const Color(0x33FFFFFF), radius: BorderRadius.circular(12), width: 1),
      ),
      inputPadding: const EdgeInsets.symmetric(vertical: 4),
    );
  }
}

class _Link extends StatelessWidget {
  const _Link(this.prefix, this.label, this.to);
  final String prefix;
  final String label;
  final String to;

  @override
  Widget build(BuildContext context) => Pressable(
    onTap: () => context.go(to),
    child: Text.rich(
      TextSpan(
        style: AppText.small,
        children: [
          TextSpan(text: prefix),
          TextSpan(
            text: label,
            style: const TextStyle(color: AppColors.fg, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    ),
  );
}

/// N boxes for the emailed code. Submits automatically when complete.
class CodeField extends StatelessWidget {
  const CodeField({super.key, required this.onChanged, this.onCompleted});
  final ValueChanged<String> onChanged;
  final ValueChanged<String>? onCompleted;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final size = ((c.maxWidth - (Config.otpLength - 1) * 7) / Config.otpLength).clamp(34.0, 48.0);
        return ShadInputOTP(
          maxLength: Config.otpLength,
          gap: 7,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          onChanged: (v) {
            onChanged(v);
            if (v.length == Config.otpLength) onCompleted?.call(v);
          },
          // One group per slot so each box stands alone with its own rounded border.
          children: [
            for (var i = 0; i < Config.otpLength; i++)
              ShadInputOTPGroup(
                children: [
                  ShadInputOTPSlot(
                    width: size,
                    height: size + 4,
                    style: AppText.title,
                    firstRadius: BorderRadius.circular(11),
                    lastRadius: BorderRadius.circular(11),
                    middleRadius: BorderRadius.circular(11),
                    decoration: ShadDecoration(
                      color: AppColors.surface,
                      border: ShadBorder.all(color: AppColors.border, radius: BorderRadius.circular(11)),
                      focusedBorder: ShadBorder.all(color: const Color(0x66FFFFFF), radius: BorderRadius.circular(11), width: 1),
                    ),
                  ),
                ],
              ),
          ],
        );
      },
    );
  }
}

class _ResendButton extends StatefulWidget {
  const _ResendButton(this.onResend);
  final Future<void> Function() onResend;

  @override
  State<_ResendButton> createState() => _ResendButtonState();
}

class _ResendButtonState extends State<_ResendButton> {
  int _left = 60;
  Timer? _t;

  @override
  void initState() {
    super.initState();
    _start();
  }

  void _start() {
    _t?.cancel();
    setState(() => _left = 60);
    _t = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_left <= 1) t.cancel();
      setState(() => _left--);
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ready = _left <= 0;
    return Center(
      child: Pressable(
        onTap: ready
            ? () async {
                await widget.onResend();
                _start();
              }
            : null,
        child: AnimatedSwitcher(
          duration: Motion.fast,
          child: Text(
            ready ? 'Resend code' : 'Resend code in ${_left}s',
            key: ValueKey(ready),
            style: AppText.small.copyWith(
              color: ready ? AppColors.fg : AppColors.muted,
              decoration: ready ? TextDecoration.underline : null,
            ),
          ),
        ),
      ),
    );
  }
}

// ───────────────────────────── Sign in ─────────────────────────────

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});
  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _email = TextEditingController(), _password = TextEditingController();
  bool _busy = false;

  Future<void> _submit() async {
    setState(() => _busy = true);
    try {
      await _sb.auth.signInWithPassword(email: _email.text.trim(), password: _password.text);
      // The router redirects to /ask when the session changes.
    } on AuthException catch (e) {
      if (!mounted) return;
      if (RegExp('not confirmed', caseSensitive: false).hasMatch(e.message)) {
        await _sb.auth.resend(type: OtpType.signup, email: _email.text.trim());
        if (mounted) context.go('/verify?email=${Uri.encodeComponent(_email.text.trim())}');
      } else {
        toast(context, authMessage(e), error: true);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthShell(
      back: '/welcome',
      title: 'Hey,\nWelcome back',
      footer: const _Link("Don't have an account? ", 'Sign up', '/sign-up'),
      children: [
        AutofillGroup(
          child: Column(
            children: [
              Field(icon: LucideIcons.mail, placeholder: 'Email', controller: _email, email: true),
              const SizedBox(height: 9),
              Field(icon: LucideIcons.lock, placeholder: 'Password', controller: _password, obscure: true, onSubmitted: (_) => _submit()),
            ],
          ),
        ),
        Center(
          child: Pressable(
            onTap: () => context.go('/forgot?email=${Uri.encodeComponent(_email.text.trim())}'),
            child: const Padding(
              padding: EdgeInsets.all(4),
              child: Text('Forgot password?', style: AppText.small),
            ),
          ),
        ),
        PillButton(label: 'Sign in', busy: _busy, onTap: _submit, height: 42),
      ],
    );
  }
}

// ───────────────────────────── Sign up ─────────────────────────────

class SignUpScreen extends StatefulWidget {
  const SignUpScreen({super.key});
  @override
  State<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends State<SignUpScreen> {
  final _email = TextEditingController(), _password = TextEditingController(), _confirm = TextEditingController();
  bool _busy = false;

  Future<void> _submit() async {
    if (_password.text.length < _minPassword) return toast(context, 'Use at least $_minPassword characters.', error: true);
    if (_password.text != _confirm.text) return toast(context, "Passwords don't match.", error: true);
    setState(() => _busy = true);
    try {
      await _sb.auth.signUp(email: _email.text.trim(), password: _password.text);
      if (mounted) context.go('/verify?email=${Uri.encodeComponent(_email.text.trim())}');
    } catch (e) {
      if (mounted) toast(context, authMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthShell(
      back: '/welcome',
      title: "Let's get\nstarted",
      footer: const _Link('Already have an account? ', 'Sign in', '/sign-in'),
      children: [
        Field(icon: LucideIcons.mail, placeholder: 'Email', controller: _email, email: true),
        Field(icon: LucideIcons.lock, placeholder: 'Password', controller: _password, obscure: true),
        Field(icon: LucideIcons.lock, placeholder: 'Confirm password', controller: _confirm, obscure: true, onSubmitted: (_) => _submit()),
        const SizedBox(height: 2),
        PillButton(label: 'Sign up', busy: _busy, onTap: _submit, height: 42),
      ],
    );
  }
}

// ───────────────────────────── Verify email ─────────────────────────────

class VerifyScreen extends StatefulWidget {
  const VerifyScreen({super.key, required this.email});
  final String email;
  @override
  State<VerifyScreen> createState() => _VerifyScreenState();
}

class _VerifyScreenState extends State<VerifyScreen> {
  String _code = '';
  bool _busy = false;

  Future<void> _verify(String code) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await _sb.auth.verifyOTP(email: widget.email, token: code, type: OtpType.email);
    } catch (e) {
      if (mounted) toast(context, authMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthShell(
      back: '/sign-up',
      title: 'Verify\nyour email',
      subtitle: Text.rich(
        TextSpan(
          children: [
            TextSpan(text: 'Enter the ${Config.otpLength}-digit code sent to '),
            TextSpan(
              text: widget.email,
              style: const TextStyle(color: AppColors.fg),
            ),
          ],
        ),
      ),
      children: [
        CodeField(onChanged: (v) => _code = v, onCompleted: _verify),
        const SizedBox(height: 4),
        _ResendButton(() async {
          try {
            await _sb.auth.resend(type: OtpType.signup, email: widget.email);
            if (context.mounted) toast(context, 'New code sent.');
          } catch (e) {
            if (context.mounted) toast(context, authMessage(e), error: true);
          }
        }),
        const SizedBox(height: 8),
        PillButton(label: 'Verify', busy: _busy, onTap: () => _verify(_code), height: 42),
      ],
    );
  }
}

// ───────────────────────────── Forgot / reset ─────────────────────────────

class ForgotScreen extends StatefulWidget {
  const ForgotScreen({super.key, required this.email});
  final String email;
  @override
  State<ForgotScreen> createState() => _ForgotScreenState();
}

class _ForgotScreenState extends State<ForgotScreen> {
  late final _email = TextEditingController(text: widget.email);
  bool _busy = false;

  Future<void> _submit() async {
    setState(() => _busy = true);
    try {
      await _sb.auth.resetPasswordForEmail(_email.text.trim());
      if (mounted) context.go('/reset?email=${Uri.encodeComponent(_email.text.trim())}');
    } catch (e) {
      if (mounted) toast(context, authMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthShell(
      back: '/sign-in',
      title: 'Forgot\npassword?',
      subtitle: const Text("Enter your email and we'll send you a code."),
      children: [
        Field(icon: LucideIcons.mail, placeholder: 'Email', controller: _email, email: true, onSubmitted: (_) => _submit()),
        PillButton(label: 'Send code', busy: _busy, onTap: _submit, height: 42),
      ],
    );
  }
}

class ResetScreen extends StatefulWidget {
  const ResetScreen({super.key, required this.email});
  final String email;
  @override
  State<ResetScreen> createState() => _ResetScreenState();
}

class _ResetScreenState extends State<ResetScreen> {
  String _code = '';
  final _password = TextEditingController(), _confirm = TextEditingController();
  bool _busy = false;

  Future<void> _submit() async {
    if (_code.length != Config.otpLength) return toast(context, 'Enter the ${Config.otpLength}-digit code.', error: true);
    if (_password.text.length < _minPassword) return toast(context, 'Use at least $_minPassword characters.', error: true);
    if (_password.text != _confirm.text) return toast(context, "Passwords don't match.", error: true);
    setState(() => _busy = true);
    try {
      await _sb.auth.verifyOTP(email: widget.email, token: _code, type: OtpType.recovery);
      await _sb.auth.updateUser(UserAttributes(password: _password.text));
      if (mounted) {
        toast(context, 'Password updated.');
        context.go('/ask');
      }
    } catch (e) {
      if (mounted) toast(context, authMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthShell(
      back: '/forgot',
      title: 'Create new\npassword',
      subtitle: Text.rich(
        TextSpan(
          children: [
            const TextSpan(text: 'Enter the code sent to '),
            TextSpan(
              text: widget.email,
              style: const TextStyle(color: AppColors.fg),
            ),
            const TextSpan(text: ' and choose a new password.'),
          ],
        ),
      ),
      children: [
        CodeField(onChanged: (v) => _code = v),
        _ResendButton(() async {
          await _sb.auth.resetPasswordForEmail(widget.email);
          if (context.mounted) toast(context, 'New code sent.');
        }),
        Field(icon: LucideIcons.lock, placeholder: 'New password', controller: _password, obscure: true),
        Field(icon: LucideIcons.lock, placeholder: 'Confirm password', controller: _confirm, obscure: true, onSubmitted: (_) => _submit()),
        PillButton(label: 'Save', busy: _busy, onTap: _submit, height: 42),
      ],
    );
  }
}
