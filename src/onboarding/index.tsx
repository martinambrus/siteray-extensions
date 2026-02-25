import { render } from 'preact';
import { OnboardingApp } from './OnboardingApp';

const root = document.getElementById('app');
if (root) {
  render(<OnboardingApp />, root);
}
