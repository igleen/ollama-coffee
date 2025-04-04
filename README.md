# Ollama Coffee GUI

A lightweight, web-based GUI in pure javascript for interacting with Ollama models.

![Ollama Coffee GUI Preview](preview.png)

## Features

- **Interactive Chat Interface**
  - Real-time response streaming
  - Support for multiple Ollama models
  - Message editing and deletion
  - Multiple themes (Light, Coffee, Dark)
  - Performance metrics tracking (duration, speed, token count)

- **Chat Management**
  - Multiple chat sessions
  - Chat history persistence
  - Import/export functionality
  - Automatic cleanup of old chats (30 days)

## Installation & Setup

1. Ensure Ollama is installed and running on your system
2. Clone this repository
3. Navigate to the project directory in your terminal
4. Run `python3 -m http.server 8000`
5. Open your browser and navigate to `http://localhost:8000`
6. Select your preferred model from the dropdown

The application will automatically connect to Ollama's API at `http://localhost:11434/api`.

### Import/Export
1. Click the "Actions" dropdown
2. Choose "Export Chat History" to save your chats
3. Choose "Import Chat History" to restore previously exported chats

### Theme Switching
1. Click the "Actions" dropdown
2. Select "Switch Theme" to cycle through available themes

## Version

Current version: 0.1

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit pull requests.
