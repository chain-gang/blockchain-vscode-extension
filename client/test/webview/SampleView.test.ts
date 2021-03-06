/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/
'use strict';

import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as chai from 'chai';
import * as sinonChai from 'sinon-chai';
import Axios from 'axios';
import * as fs from 'fs-extra';
import * as shell from 'shelljs';
import * as path from 'path';
import { SampleView } from '../../src/webview/SampleView';
import { VSCodeBlockchainOutputAdapter } from '../../src/logging/VSCodeBlockchainOutputAdapter';
import { CommandUtil } from '../../src/util/CommandUtil';
import { TestUtil } from '../TestUtil';
import { RepositoryRegistry } from '../../src/repositories/RepositoryRegistry';
import { UserInputUtil } from '../../src/commands/UserInputUtil';
import * as ejs from 'ejs';
import { LogType } from '../../src/logging/OutputAdapter';
import { View } from '../../src/webview/View';
import { Reporter } from '../../src/util/Reporter';

const should: Chai.Should = chai.should();
chai.use(sinonChai);

// tslint:disable no-unused-expression
describe('SampleView', () => {
    let mySandBox: sinon.SinonSandbox;

    let repositoryName: string;
    let createWebviewPanelStub: sinon.SinonStub;
    let context: vscode.ExtensionContext;
    let sendCommandWithOutputAndProgress: sinon.SinonStub;
    let sendTelemetryEventStub: sinon.SinonStub;

    beforeEach(async () => {
        mySandBox = sinon.createSandbox();
        repositoryName = 'hyperledger/fabric-samples';

        context = {
            extensionPath: 'path'
        } as vscode.ExtensionContext;
        mySandBox.spy(vscode.commands, 'executeCommand');

        createWebviewPanelStub = mySandBox.stub(vscode.window, 'createWebviewPanel');
        createWebviewPanelStub.returns({
            webview: {
                onDidReceiveMessage: mySandBox.stub()
            },
            reveal: (): void => {
                return;
            },
            onDidDispose: mySandBox.stub(),
            onDidChangeViewState: mySandBox.stub()

        });

        sendCommandWithOutputAndProgress = mySandBox.stub(CommandUtil, 'sendCommandWithOutputAndProgress').resolves();
        View['openPanels'].splice(0, View['openPanels'].length);
        sendTelemetryEventStub = mySandBox.stub(Reporter.instance(), 'sendTelemetryEvent');
    });

    afterEach(() => {
        mySandBox.restore();
    });

    it('should register and show sample page', async () => {

        const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');
        await sampleView.openView(false);
        createWebviewPanelStub.should.have.been.called;
    });

    it('should do nothing if command not recognised', async () => {
        const onDidReceiveMessagePromises: any[] = [];

        const postMessageStub: sinon.SinonStub = mySandBox.stub().resolves();

        onDidReceiveMessagePromises.push(new Promise((resolve: any): void => {
            createWebviewPanelStub.onCall(0).returns({
                webview: {
                    onDidReceiveMessage: async (callback: any): Promise<void> => {
                        await callback({command: 'unknown-command'});
                        resolve();
                    },
                    postMessage: postMessageStub
                },
                reveal: (): void => {
                    return;
                },
                onDidDispose: mySandBox.stub(),
                onDidChangeViewState: mySandBox.stub()

            });
        }));

        const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');
        const htmlSpy: sinon.SinonSpy = mySandBox.spy(sampleView, 'getHTMLString');
        await sampleView.openView(false);
        await Promise.all(onDidReceiveMessagePromises);

        createWebviewPanelStub.getCall(0).should.have.been.calledWith(
            'FabCar',
            'FabCar Sample',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: false,
                enableCommandUris: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(context.extensionPath, 'resources'))
                ]
            }
        );

        htmlSpy.should.have.been.calledOnce;
        postMessageStub.should.not.have.been.called;
    });

    it('should dispose sample page', async () => {
        const onDidReceiveMessagePromises: any[] = [];

        const disposeStub: sinon.SinonStub = mySandBox.stub().yields();

        onDidReceiveMessagePromises.push(new Promise((resolve: any): void => {
            createWebviewPanelStub.onCall(0).returns({
                title: 'FabCar Sample',
                webview: {
                    onDidReceiveMessage: async (callback: any): Promise<void> => {
                        await callback({command: 'unknown-command'});
                        resolve();
                    },
                    postMessage: mySandBox.stub().resolves()
                },
                reveal: (): void => {
                    return;
                },
                onDidDispose: disposeStub,
                onDidChangeViewState: mySandBox.stub()

            });
        }));

        const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');
        await sampleView.openView(false);
        await Promise.all(onDidReceiveMessagePromises);
        createWebviewPanelStub.getCall(0).should.have.been.calledWith(
            'FabCar',
            'FabCar Sample',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: false,
                enableCommandUris: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(context.extensionPath, 'resources'))
                ]
            }
        );

        disposeStub.should.have.been.called;
    });

    it('should reveal panel if open already', async () => {

        const onDidReceiveMessagePromises: any[] = [];
        onDidReceiveMessagePromises.push(new Promise((resolve: any): void => {
            createWebviewPanelStub.onCall(0).returns({
                webview: {
                    onDidReceiveMessage: async (callback: any): Promise<void> => {
                        await callback({
                            command: 'openSample',
                            repoName: 'hyperledger/fabric-samples',
                            sampleName: 'FabCar'
                        });
                        resolve();
                    }
                },
                title: 'FabCar Sample',
                reveal: (): void => {
                    return;
                },
                onDidDispose: mySandBox.stub(),
                onDidChangeViewState: mySandBox.stub()
            });
        }));

        const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');
        await sampleView.openView(false);
        await sampleView.openView(false);

        await Promise.all(onDidReceiveMessagePromises);

        should.equal(createWebviewPanelStub.getCall(1), null);
    });

    describe('getHTMLString', () => {

        it('should get correct html when not cloned', async () => {
            const readme: string = `# FabCar README

            This is the readme`;

            const AxiosStub: sinon.SinonStub = mySandBox.stub(Axios, 'get').resolves({data: readme});

            mySandBox.stub(ejs, 'renderFile').callThrough();

            const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');
            const samplePageHtml: string = await sampleView.getHTMLString();
            AxiosStub.should.have.been.calledWith('https://raw.githubusercontent.com/hyperledger/fabric-samples/release-1.4/README.md');

            samplePageHtml.should.contain(`<h1 id="sample-title">FabCar Sample</h1>`);
            samplePageHtml.should.contain(`<button class="clone-button" onclick="cloneRepository()">Clone</button>`);
            samplePageHtml.should.contain(`<h1 id="fabcarreadme">FabCar README</h1>`); // Comes from MD to HTML generation
            samplePageHtml.should.contain(`<div class="cell">FabCar Contract</div>`); // Row in Contracts table
            samplePageHtml.should.contain(`<button disabled class="open-button" onclick="openFile('contracts','FabCar Contract','Go')">Open Locally</button>`); // Disabled open button
            samplePageHtml.should.contain(`<button disabled class="open-button" onclick="openFile('applications','JavaScript Application')">Open Locally</button>`); // Disabled open button
            samplePageHtml.should.contain(`<button disabled class="open-button" onclick="openFile('applications','TypeScript Application')">Open Locally</button>`); // Disabled open button
        });

        it('should throw error if not able to render file', async () => {
            const readme: string = `# FabCar README

            This is the readme`;

            mySandBox.stub(Axios, 'get').resolves({data: readme});

            const error: Error = new Error('error happened');
            mySandBox.stub(ejs, 'renderFile').yields(error);

            const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');
            await sampleView.getHTMLString().should.be.rejectedWith(error);
        });

        it('should get correct html when cloned', async () => {
            const readme: string = `# FabCar README

            This is the readme`;

            const AxiosStub: sinon.SinonStub = mySandBox.stub(Axios, 'get').resolves({data: readme});

            mySandBox.stub(RepositoryRegistry.instance(), 'get').returns({
                name: 'hyperledger/fabric-samples',
                path: '/some/path'
            });

            const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');
            const samplePageHtml: string = await sampleView.getHTMLString();

            AxiosStub.should.have.been.calledWith('https://raw.githubusercontent.com/hyperledger/fabric-samples/release-1.4/README.md');

            samplePageHtml.should.contain(`<h1 id="sample-title">FabCar Sample</h1>`);
            samplePageHtml.should.contain(`<div class="repository-config-item">Cloned to: /some/path</div>`); // Cloned, so shows the location
            samplePageHtml.should.contain(`<div class="repository-config-item"><a href="#" onclick="cloneRepository(true)">Clone again</a></div>`); // Can clone again
            samplePageHtml.should.contain(`<h1 id="fabcarreadme">FabCar README</h1>`); // Comes from MD to HTML generation
            samplePageHtml.should.contain(`<div class="cell">FabCar Contract</div>`); // Row in Contracts table
            samplePageHtml.should.contain(`<button class="open-button" onclick="openFile('contracts','FabCar Contract','Go')">Open Locally</button>`); // Disabled open button
            samplePageHtml.should.contain(`<button class="open-button" onclick="openFile('applications','JavaScript Application')">Open Locally</button>`); // Disabled open button
            samplePageHtml.should.contain(`<button class="open-button" onclick="openFile('applications','TypeScript Application')">Open Locally</button>`); // Disabled open button
        });
    });

    describe('getLanguageVersion', () => {

        it('should get version of a contract, depending on the language', async () => {

            const onDidReceiveMessagePromises: any[] = [];

            const postMessageStub: sinon.SinonStub = mySandBox.stub().resolves();

            onDidReceiveMessagePromises.push(new Promise((resolve: any): void => {
                createWebviewPanelStub.onCall(0).returns({
                    webview: {
                        onDidReceiveMessage: async (callback: any): Promise<void> => {
                            await callback({
                                command: 'getLanguageVersion',
                                contractName: 'FabCar Contract',
                                languageType: 'Go'
                            });
                            resolve();
                        },
                        postMessage: postMessageStub
                    },
                    reveal: (): void => {
                        return;
                    },
                    onDidDispose: mySandBox.stub(),
                    onDidChangeViewState: mySandBox.stub()

                });
            }));

            const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');
            await sampleView.openView(false);

            await Promise.all(onDidReceiveMessagePromises);

            postMessageStub.should.have.been.calledWith({version: '1.0.0'});
        });
    });

    describe('cloneRepository', () => {

        let onDidReceiveMessagePromises: any[];

        before(async () => {
            await TestUtil.storeRepositoriesConfig();
        });

        after(async () => {
            await TestUtil.restoreRepositoriesConfig();
        });

        function setUpTest(reclone: boolean): void {
            onDidReceiveMessagePromises = [];

            onDidReceiveMessagePromises.push(new Promise((resolve: any): void => {
                createWebviewPanelStub.onCall(0).returns({
                    webview: {
                        onDidReceiveMessage: async (callback: any): Promise<void> => {
                            await callback({
                                command: 'clone',
                                repository: 'https://github.com/hyperledger/fabric-samples.git',
                                recloning: reclone
                            });
                            resolve();
                        }
                    },
                    reveal: (): void => {
                        return;
                    },
                    onDidDispose: mySandBox.stub(),
                    onDidChangeViewState: mySandBox.stub()
                });
            }));
        }

        it('should clone a repository and save to disk', async () => {
            setUpTest(false);
            const outputAdapterSpy: sinon.SinonSpy = mySandBox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');
            const repositoryRegistryStub: sinon.SinonStub = mySandBox.stub(RepositoryRegistry.prototype, 'add').resolves();

            mySandBox.stub(vscode.window, 'showSaveDialog').resolves({fsPath: '/some/path'});
            mySandBox.stub(CommandUtil, 'sendCommandWithProgress').resolves();

            const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');

            await sampleView.openView(false);

            await Promise.all(onDidReceiveMessagePromises);

            outputAdapterSpy.should.have.been.calledTwice;
            repositoryRegistryStub.should.have.been.calledOnceWithExactly({name: repositoryName, path: '/some/path'});
            outputAdapterSpy.getCall(1).should.have.been.calledWithExactly(LogType.SUCCESS, 'Successfully cloned repository!');
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('Sample Cloned', {sample: 'FabCar'});
        });

        it('should stop if user cancels dialog', async () => {
            setUpTest(false);
            const outputAdapterSpy: sinon.SinonSpy = mySandBox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');
            const repositoryRegistryStub: sinon.SinonStub = mySandBox.stub(RepositoryRegistry.prototype, 'add');

            mySandBox.stub(vscode.window, 'showSaveDialog').resolves();
            const sendCommandWithProgressStub: sinon.SinonStub = mySandBox.stub(CommandUtil, 'sendCommandWithProgress').resolves();

            const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');

            await sampleView.openView(false);

            await Promise.all(onDidReceiveMessagePromises);

            outputAdapterSpy.should.not.have.been.called;
            sendCommandWithProgressStub.should.not.have.been.called;
            repositoryRegistryStub.should.not.have.been.called;
        });

        it('should throw an error if repository cannot be cloned', async () => {
            setUpTest(false);
            const outputAdapterSpy: sinon.SinonSpy = mySandBox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');

            mySandBox.stub(vscode.window, 'showSaveDialog').resolves({fsPath: '/some/path'});

            const error: Error = new Error('problem cloning');
            mySandBox.stub(CommandUtil, 'sendCommandWithProgress').throws(error);

            const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');

            await sampleView.openView(false);

            await Promise.all(onDidReceiveMessagePromises);

            outputAdapterSpy.should.have.been.calledOnceWithExactly(LogType.ERROR, `Could not clone sample: ${error.message}`);
        });

        it('should reclone a repository and update the repository registry', async () => {
            setUpTest(true);
            const outputAdapterSpy: sinon.SinonSpy = mySandBox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');
            const repositoryRegistryStub: sinon.SinonStub = mySandBox.stub(RepositoryRegistry.instance(), 'update').resolves();

            mySandBox.stub(vscode.window, 'showSaveDialog').resolves({fsPath: '/some/path'});
            mySandBox.stub(CommandUtil, 'sendCommandWithProgress').resolves();

            const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');

            await sampleView.openView(false);

            await Promise.all(onDidReceiveMessagePromises);

            outputAdapterSpy.should.have.been.calledTwice;
            repositoryRegistryStub.should.have.been.calledOnceWithExactly({
                name: 'hyperledger/fabric-samples',
                path: '/some/path'
            });
            outputAdapterSpy.getCall(1).should.have.been.calledWithExactly(LogType.SUCCESS, 'Successfully cloned repository!');
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('Sample Cloned', {sample: 'FabCar'});
        });
    });

    describe('openFile', () => {

        let repositoryRegistryGetStub: sinon.SinonStub;
        let onDidReceiveMessagePromises: any[] = [];

        before(async () => {
            await TestUtil.storeRepositoriesConfig();
        });

        after(async () => {
            await TestUtil.restoreRepositoriesConfig();
        });

        afterEach(() => {
            onDidReceiveMessagePromises = [];
        });

        async function setupTest(fileType: string, fileName: string, language: string): Promise<void> {
            repositoryRegistryGetStub = mySandBox.stub(RepositoryRegistry.instance(), 'get').returns({
                name: repositoryName,
                path: '/some/path'
            });

            onDidReceiveMessagePromises.push(new Promise((resolve: any, reject: any): void => {
                createWebviewPanelStub.onCall(0).returns({
                    webview: {
                        onDidReceiveMessage: async (callback: any): Promise<void> => {
                            try {
                                await callback({
                                    command: 'open',
                                    fileType: fileType,
                                    fileName: fileName,
                                    language: language
                                });
                                resolve();
                            } catch (error) {
                                reject(error);
                            }
                        }
                    },
                    reveal: (): void => {
                        return;
                    },
                    onDidDispose: mySandBox.stub(),
                    onDidChangeViewState: mySandBox.stub()

                });
            }));
        }

        it('should open contract', async () => {
            await setupTest('contracts', 'FabCar Contract', 'Go');
            const pathExistsStub: sinon.SinonStub = mySandBox.stub(fs, 'pathExists').resolves(true);
            const shellCdStub: sinon.SinonStub = mySandBox.stub(shell, 'cd').returns(undefined);
            const sendCommandStub: sinon.SinonStub = mySandBox.stub(CommandUtil, 'sendCommand').resolves();
            mySandBox.stub(UserInputUtil, 'delayWorkaround').resolves();
            mySandBox.stub(UserInputUtil, 'showFolderOptions').resolves(UserInputUtil.ADD_TO_WORKSPACE);
            const openNewProjectStub: sinon.SinonStub = mySandBox.stub(UserInputUtil, 'openNewProject').resolves();

            const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');

            await sampleView.openView(false);

            await Promise.all(onDidReceiveMessagePromises);

            repositoryRegistryGetStub.should.have.been.calledWithExactly(repositoryName);
            pathExistsStub.should.have.been.calledOnceWithExactly('/some/path');
            shellCdStub.should.have.been.calledOnceWithExactly('/some/path');
            sendCommandStub.should.have.been.calledOnceWithExactly('git checkout -b release-1.4 origin/release-1.4');
            openNewProjectStub.should.have.been.calledOnce;

            sendCommandWithOutputAndProgress.should.not.have.been.called;
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('Sample Opened', {sample: 'FabCar', name: 'FabCar Contract', type: 'contracts', language: 'Go'});
        });

        it(`should show error if the repository isn't in the user settings`, async () => {
            await setupTest('contracts', 'FabCar Contract', 'Go');
            repositoryRegistryGetStub.returns(undefined);
            const logSpy: sinon.SinonSpy = mySandBox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');

            mySandBox.stub(UserInputUtil, 'delayWorkaround').resolves();
            mySandBox.stub(UserInputUtil, 'showFolderOptions').resolves(UserInputUtil.ADD_TO_WORKSPACE);

            const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');

            await sampleView.openView(false);

            await Promise.all(onDidReceiveMessagePromises);

            repositoryRegistryGetStub.should.have.been.calledWithExactly(repositoryName);
            logSpy.should.have.been.calledOnceWithExactly(LogType.ERROR, 'The location of the cloned repository on the disk is unknown. Try re-cloning the sample repository.');
        });

        it('should delete the repository from the user settings if the directory cannot be found on disk', async () => {
            await setupTest('contracts', 'FabCar Contract', 'Go');
            const repositoryRegistryDeleteStub: sinon.SinonStub = mySandBox.stub(RepositoryRegistry.instance(), 'delete').resolves();
            const logSpy: sinon.SinonSpy = mySandBox.spy(VSCodeBlockchainOutputAdapter.instance(), 'log');

            const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');

            await sampleView.openView(false);

            await Promise.all(onDidReceiveMessagePromises);

            repositoryRegistryGetStub.should.have.been.calledWithExactly(repositoryName);
            repositoryRegistryDeleteStub.should.have.been.calledOnceWithExactly(repositoryName);
            logSpy.should.have.been.calledOnceWithExactly(LogType.ERROR, `The location of the file(s) you're trying to open is unknown. The sample repository has either been deleted or moved. Try re-cloning the sample repository.`);
        });

        it('should return if user doesnt select how to open files', async () => {
            await setupTest('contracts', 'FabCar Contract', 'Go');
            const pathExistsStub: sinon.SinonStub = mySandBox.stub(fs, 'pathExists').resolves(true);
            const shellCdStub: sinon.SinonStub = mySandBox.stub(shell, 'cd').returns(undefined);
            const sendCommandStub: sinon.SinonStub = mySandBox.stub(CommandUtil, 'sendCommand').resolves();
            mySandBox.stub(UserInputUtil, 'delayWorkaround').resolves();
            mySandBox.stub(UserInputUtil, 'showFolderOptions').resolves();
            const openNewProjectStub: sinon.SinonStub = mySandBox.stub(UserInputUtil, 'openNewProject').resolves();

            const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');

            await sampleView.openView(false);

            await Promise.all(onDidReceiveMessagePromises);

            repositoryRegistryGetStub.should.have.been.calledWithExactly(repositoryName);
            pathExistsStub.should.have.been.calledOnceWithExactly('/some/path');
            shellCdStub.should.have.been.calledOnceWithExactly('/some/path');
            sendCommandStub.should.have.been.calledOnceWithExactly('git checkout -b release-1.4 origin/release-1.4');
            openNewProjectStub.should.have.not.have.been.called;
        });

        it('should handle if the local branch already exists', async () => {
            await setupTest('contracts', 'FabCar Contract', 'Go');
            const pathExistsStub: sinon.SinonStub = mySandBox.stub(fs, 'pathExists').resolves(true);
            const shellCdStub: sinon.SinonStub = mySandBox.stub(shell, 'cd').returns(undefined);
            const sendCommandStub: sinon.SinonStub = mySandBox.stub(CommandUtil, 'sendCommand');

            const errorOne: Error = new Error('already exists');
            sendCommandStub.onCall(0).throws(errorOne);
            sendCommandStub.onCall(1).resolves();

            mySandBox.stub(UserInputUtil, 'delayWorkaround').resolves();
            mySandBox.stub(UserInputUtil, 'showFolderOptions').resolves(UserInputUtil.ADD_TO_WORKSPACE);
            const openNewProjectStub: sinon.SinonStub = mySandBox.stub(UserInputUtil, 'openNewProject').resolves();

            const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');

            await sampleView.openView(false);

            await Promise.all(onDidReceiveMessagePromises);

            repositoryRegistryGetStub.should.have.been.calledWithExactly(repositoryName);
            pathExistsStub.should.have.been.calledOnceWithExactly('/some/path');
            shellCdStub.should.have.been.calledOnceWithExactly('/some/path');
            sendCommandStub.getCall(1).should.have.been.calledWithExactly('git checkout release-1.4');
            openNewProjectStub.should.have.been.calledOnce;
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('Sample Opened', {sample: 'FabCar', name: 'FabCar Contract', type: 'contracts', language: 'Go'});
        });

        it('should handle other errors', async () => {
            await setupTest('contracts', 'FabCar Contract', 'Go');
            const pathExistsStub: sinon.SinonStub = mySandBox.stub(fs, 'pathExists').resolves(true);
            const shellCdStub: sinon.SinonStub = mySandBox.stub(shell, 'cd').returns(undefined);
            const sendCommandStub: sinon.SinonStub = mySandBox.stub(CommandUtil, 'sendCommand');

            const errorOne: Error = new Error('some other error');
            sendCommandStub.onCall(0).throws(errorOne);
            sendCommandStub.onCall(1).resolves();

            const openNewProjectStub: sinon.SinonStub = mySandBox.stub(UserInputUtil, 'openNewProject').resolves();

            const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');

            await sampleView.openView(false);

            await Promise.all(onDidReceiveMessagePromises).should.be.rejectedWith('Could not retrieve file(s) from repository: some other error');

            repositoryRegistryGetStub.should.have.been.calledWithExactly(repositoryName);
            pathExistsStub.should.have.been.calledOnceWithExactly('/some/path');
            shellCdStub.should.have.been.calledOnceWithExactly('/some/path');
            openNewProjectStub.should.have.not.have.been.called;
        });

        it('should throw an error if a second error is thrown and repository cant be checked out automatically', async () => {
            await setupTest('contracts', 'FabCar Contract', 'Go');
            const pathExistsStub: sinon.SinonStub = mySandBox.stub(fs, 'pathExists').resolves(true);
            const shellCdStub: sinon.SinonStub = mySandBox.stub(shell, 'cd').returns(undefined);
            const sendCommandStub: sinon.SinonStub = mySandBox.stub(CommandUtil, 'sendCommand');

            const errorOne: Error = new Error('already exists');
            const errorTwo: Error = new Error('couldnt checkout for some reason');
            sendCommandStub.onCall(0).throws(errorOne);
            sendCommandStub.onCall(1).throws(errorTwo);

            mySandBox.stub(UserInputUtil, 'delayWorkaround').resolves();
            mySandBox.stub(UserInputUtil, 'showFolderOptions').resolves(UserInputUtil.ADD_TO_WORKSPACE);
            const openNewProjectStub: sinon.SinonStub = mySandBox.stub(UserInputUtil, 'openNewProject').resolves();

            const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');

            await sampleView.openView(false);

            await Promise.all(onDidReceiveMessagePromises).should.be.rejectedWith(/Couldn't automatically checkout 'release-1.4' branch. Please checkout branch manually. Error: couldnt checkout for some reason/);

            repositoryRegistryGetStub.should.have.been.calledWithExactly(repositoryName);
            pathExistsStub.should.have.been.calledOnceWithExactly('/some/path');
            shellCdStub.should.have.been.calledOnceWithExactly('/some/path');
            sendCommandStub.getCall(1).should.have.been.calledWithExactly('git checkout release-1.4');
            openNewProjectStub.should.not.have.been.called;
        });

        it('should open application', async () => {
            await setupTest('applications', 'JavaScript Application', 'JavaScript');
            const pathExistsStub: sinon.SinonStub = mySandBox.stub(fs, 'pathExists').resolves(true);
            const shellCdStub: sinon.SinonStub = mySandBox.stub(shell, 'cd').returns(undefined);
            const sendCommandStub: sinon.SinonStub = mySandBox.stub(CommandUtil, 'sendCommand').resolves();
            mySandBox.stub(UserInputUtil, 'delayWorkaround').resolves();
            mySandBox.stub(UserInputUtil, 'showFolderOptions').resolves(UserInputUtil.ADD_TO_WORKSPACE);
            const openNewProjectStub: sinon.SinonStub = mySandBox.stub(UserInputUtil, 'openNewProject').resolves();

            const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');

            await sampleView.openView(false);

            await Promise.all(onDidReceiveMessagePromises);

            repositoryRegistryGetStub.should.have.been.calledWithExactly(repositoryName);
            pathExistsStub.should.have.been.calledOnceWithExactly('/some/path');
            shellCdStub.should.have.been.calledOnceWithExactly('/some/path');
            sendCommandStub.should.have.been.calledOnceWithExactly('git checkout -b release-1.4 origin/release-1.4');
            openNewProjectStub.should.have.been.calledOnce;

            const outputAdapter: VSCodeBlockchainOutputAdapter = VSCodeBlockchainOutputAdapter.instance();
            sendCommandWithOutputAndProgress.should.have.been.calledOnceWithExactly('npm', ['install'], 'Installing Node.js dependencies ...', path.join('/', 'some', 'path', 'fabcar', 'javascript'), null, outputAdapter);
            sendTelemetryEventStub.should.have.been.calledOnceWithExactly('Sample Opened', {sample: 'FabCar', name: 'JavaScript Application', type: 'applications', language: 'JavaScript'});
        });

        it('should throw an error if fileType not recognised', async () => {
            await setupTest('bob', 'bob file', 'Go');
            const openNewProjectStub: sinon.SinonStub = mySandBox.stub(UserInputUtil, 'openNewProject');

            const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');

            await sampleView.openView(false);

            await Promise.all(onDidReceiveMessagePromises).should.be.rejectedWith(/File type not supported/);

            openNewProjectStub.should.not.have.been.called;
        });

        it('should throw an error if language not recognised', async () => {
            await setupTest('contracts', 'FabCar Contract', 'myLanguage');
            const openNewProjectStub: sinon.SinonStub = mySandBox.stub(UserInputUtil, 'openNewProject');

            const sampleView: SampleView = new SampleView(context, 'hyperledger/fabric-samples', 'FabCar');

            await sampleView.openView(false);

            await Promise.all(onDidReceiveMessagePromises).should.be.rejectedWith(/Language type not supported/);

            openNewProjectStub.should.not.have.been.called;
        });
    });
});
