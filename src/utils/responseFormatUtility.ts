import { createScanner, SyntaxKind } from 'jsonc-parser';
import * as os from 'os';
import { window } from 'vscode';
import { MimeUtility } from './mimeUtility';
import { isJSONString } from './misc';
const pd = require('pretty-data').pd;
const childProcess = require('child_process');

export class ResponseFormatUtility {

    private static readonly jsonSpecialTokenMapping = {
        [SyntaxKind.OpenBraceToken]: '{',
        [SyntaxKind.CloseBraceToken]: '}',
        [SyntaxKind.OpenBracketToken]: '[',
        [SyntaxKind.CloseBracketToken]: ']',
        [SyntaxKind.ColonToken]: ':',
        [SyntaxKind.CommaToken]: ',',
        [SyntaxKind.NullKeyword]: 'null',
        [SyntaxKind.TrueKeyword]: 'true',
        [SyntaxKind.FalseKeyword]: 'false'
    };

    public static formatBody(body: string, contentType: string | undefined, suppressValidation: boolean): string {
        if (contentType) {
            if (MimeUtility.isJSON(contentType)) {
                if (isJSONString(body)) {
                    body = this.jsonPrettify(body);
                } else if (body && !suppressValidation) {
                    window.showWarningMessage('The content type of response is application/json, while response body is not a valid json string');
                }
            } else if (MimeUtility.isXml(contentType)) {
                body = pd.xml(body);
            } else if (MimeUtility.isCSS(contentType)) {
                body = pd.css(body);
            } else if (MimeUtility.isProtobuf(contentType)) {
                try {
                    body = childProcess.execSync('protoc --decode_raw', { input: body });
                } catch (e) {
                    body = 'protoc is not found in PATH. Cannot decode protobuf binary.';
                }
            } else {
                // Add this for the case that the content type of response body is not very accurate #239
                if (isJSONString(body)) {
                    body = this.jsonPrettify(body);
                }
            }
        }

        return body;
    }

    private static jsonPrettify(text: string, indentSize = 2) {
        const scanner = createScanner(text, true);

        let indentLevel = 0;

        function newLineAndIndent() {
            return os.EOL + ' '.repeat(indentLevel * indentSize);
        }

        function scanNext(): [SyntaxKind, string] {
            const token = scanner.scan();
            const offset = scanner.getTokenOffset();
            const length = scanner.getTokenLength();
            const value = text.substr(offset, length);
            return [ token, value ];
        }

        let [firstToken, firstTokenValue] = scanNext();
        let secondToken: SyntaxKind;
        let secondTokenValue: string;
        let result = '';

        while (firstToken !== SyntaxKind.EOF) {
            [secondToken, secondTokenValue] = scanNext();

            switch (firstToken) {
                case SyntaxKind.OpenBraceToken:
                    result += this.jsonSpecialTokenMapping[firstToken];
                    if (secondToken !== SyntaxKind.CloseBraceToken) {
                        indentLevel++;
                        result += newLineAndIndent();
                    }
                    break;
                case SyntaxKind.OpenBracketToken:
                    result += this.jsonSpecialTokenMapping[firstToken];
                    if (secondToken !== SyntaxKind.CloseBracketToken) {
                        indentLevel++;
                        result += newLineAndIndent();
                    }
                    break;
                case SyntaxKind.CloseBraceToken:
                case SyntaxKind.CloseBracketToken:
                case SyntaxKind.NullKeyword:
                case SyntaxKind.TrueKeyword:
                case SyntaxKind.FalseKeyword:
                    result += this.jsonSpecialTokenMapping[firstToken];
                    if (secondToken === SyntaxKind.CloseBraceToken
                        || secondToken === SyntaxKind.CloseBracketToken) {
                        indentLevel--;
                        result += newLineAndIndent();
                    }
                    break;
                case SyntaxKind.CommaToken:
                    result += this.jsonSpecialTokenMapping[firstToken];
                    if (secondToken === SyntaxKind.CloseBraceToken
                        || secondToken === SyntaxKind.CloseBracketToken) {
                        indentLevel--;
                    }
                    result += newLineAndIndent();
                    break;
                case SyntaxKind.ColonToken:
                    result += this.jsonSpecialTokenMapping[firstToken] + ' ';
                    break;
                case SyntaxKind.StringLiteral:
                case SyntaxKind.NumericLiteral:
                case SyntaxKind.Unknown:
                    result += firstTokenValue;
                    if (secondToken === SyntaxKind.CloseBraceToken
                        || secondToken === SyntaxKind.CloseBracketToken) {
                        indentLevel--;
                        result += newLineAndIndent();
                    }
                    break;
                default:
                    result += firstTokenValue;
            }

            firstToken = secondToken;
            firstTokenValue = secondTokenValue;
        }

        return result;
    }
}