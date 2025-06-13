![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![GitHub](https://img.shields.io/badge/github-%23121011.svg?style=for-the-badge&logo=github&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/github%20actions-%232671E5.svg?style=for-the-badge&logo=githubactions&logoColor=white)
![Visual Studio Code](https://img.shields.io/badge/Visual%20Studio%20Code-0078d7.svg?style=for-the-badge&logo=visual-studio-code&logoColor=white)

# 3D Secure Vanilla Library

A modern Vanilla library that simplifies the integration of 3D Secure (3DS) authentication for secure payment processing in web applications.

## Overview

This library provides a set of utilities to implement 3D Secure authentication flows in your payment applications. It supports the full 3DS authentication lifecycle including directory server interactions, challenges, and result handling.

## Features

- Complete 3D Secure authentication flow
- Handles the entire authentication lifecycle
- Type-safe implementation with TypeScript
- Responsive challenge rendering
- Cancellable authentication processes

## Installation

```bash
npm install @paypayhub/sqala-3ds-js
# or
yarn add @paypayhub/sqala-3ds-js
```

## Quick Start

```tsx
import { ThreeDSecureService } from '@paypayhub/sqala-3ds-js';

async function PaymentComponent() {
  const container = document.getElementById('container');

   const eventHandler = (event, data) => {
    // Handle UI state based on received events
   };
  
  const threeDSecureService = new ThreeDSecureService({
    baseUrl: 'https://api.sqala.tech/core/v1/threedsecure',
    publicKey: 'YOUR-PUBLIC-KEY',
    container,
    eventHandler,
  });

  const result = await threeDSecureService.execute({
    id: 'authentication-id' // Unique identifier for the authentication
  });

  console.log(result);
}
```

## Development Setup

### Prerequisites

- Node.js 18+ and npm/yarn
- Modern browser with DevTools for debugging

### Setting Up the Development Environment

1. Clone the repository:
   ```bash
   git clone https://github.com/paypayhub/sqala-3ds-js.git
   cd threedsecure-js
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn
   ```

### Project Structure

```
sqala-3ds-js/
├── lib/                  # Library source code
│   ├── services/         # Service implementation
│   ├── types/            # TypeScript type definitions
│   └── main.ts           # Main entry point
├── src/                  # Demo application
├── dist/                 # Build output
├── .vscode/              # VS Code configuration
├── tsconfig.lib.json     # TypeScript config for the library
└── vite.config.ts        # Vite configuration
```

## Building for Production

```bash
npm run build
# or
yarn build
```

This generates the library output in the `dist` directory.

## Contributing

We welcome contributions from the community! Here are some ways you can contribute:

### Reporting Issues

- Use the issue tracker to report bugs
- Include detailed steps to reproduce the issue
- Mention your environment (browser, OS, library version)

### Feature Requests

- Open an issue describing the feature
- Explain the use case and benefits
- Discuss implementation approaches

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style and patterns
- Write unit tests for new features
- Update documentation for any API changes
- Keep commits focused and atomic
- Use semantic commit messages

## License

[MIT](LICENSE)

## Acknowledgements

- This library is developed and maintained by Sqala
- Special thanks to all the contributors who have helped improve this project