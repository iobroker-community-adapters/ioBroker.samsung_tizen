import React from 'react';

import { Box, ButtonBase, CircularProgress, Tooltip, Typography } from '@mui/material';
import {
    Add,
    ArrowBack,
    FastForward,
    FastRewind,
    Home,
    Info,
    Input,
    KeyboardArrowDown,
    KeyboardArrowLeft,
    KeyboardArrowRight,
    KeyboardArrowUp,
    Menu,
    Pause,
    PlayArrow,
    PowerSettingsNew,
    Remove,
    SettingsPower,
    Stop,
    VolumeOff,
} from '@mui/icons-material';
import { I18n } from '@iobroker/gui-components';
import { ConfigGeneric, type ConfigGenericProps, type ConfigGenericState } from '@iobroker/json-config';

/** How long a key may take before the remote reports that the instance does not answer, in ms */
const SEND_TIMEOUT = 8_000;

/** Keyboard keys that work while the remote has the focus */
const KEYBOARD: Record<string, string> = {
    ArrowUp: 'KEY_UP',
    ArrowDown: 'KEY_DOWN',
    ArrowLeft: 'KEY_LEFT',
    ArrowRight: 'KEY_RIGHT',
    Enter: 'KEY_ENTER',
    Backspace: 'KEY_RETURN',
    Escape: 'KEY_RETURN',
    Home: 'KEY_HOME',
    '+': 'KEY_VOLUP',
    '-': 'KEY_VOLDOWN',
    m: 'KEY_MUTE',
    ' ': 'KEY_PLAY',
};

/** What a press sends: a remote key, or Wake-on-LAN */
type Command = { key: string } | { wake: true };

interface RemoteControlComponentState extends ConfigGenericState {
    /** Key or command that is being sent right now */
    busy: string | null;
    /** Text of the last error, empty if the last key went through */
    error: string;
    /** `powerOn` of the instance - only there if the power state polling is configured */
    powerOn: boolean | null;
}

const COLORS = {
    body: 'linear-gradient(180deg, #2b2f36 0%, #1c1f24 100%)',
    key: '#3a3f47',
    keyHover: '#4a505a',
    keyActive: '#5b626e',
    text: '#e8eaed',
    textDim: '#9aa0a6',
    power: '#c62828',
    powerHover: '#e53935',
    ring: '#30343b',
    ok: '#454b54',
};

/**
 * A remote control in the settings, so a user sees right away whether the TV answers.
 *
 * Every key goes as `sendTo('remote', { key })` to the running instance, which sends it over the
 * websocket of the TV and answers once it is written - or with an error that is shown below the
 * remote. It works with the saved configuration of the instance, not with what is typed into the
 * settings form.
 */
export default class RemoteControlComponent extends ConfigGeneric<ConfigGenericProps, RemoteControlComponentState> {
    private mounted = false;

    constructor(props: ConfigGenericProps) {
        super(props);
        this.state = {
            ...this.state,
            busy: null,
            error: '',
            powerOn: null,
        };
    }

    get target(): string {
        return `${this.props.oContext.adapterName}.${this.props.oContext.instance}`;
    }

    get powerOnId(): string {
        return `${this.target}.powerOn`;
    }

    async componentDidMount(): Promise<void> {
        void super.componentDidMount();
        this.mounted = true;
        try {
            const state = await this.props.oContext.socket.getState(this.powerOnId);
            if (state && this.mounted) {
                this.setState({ powerOn: !!state.val });
            }
            await this.props.oContext.socket.subscribeState(this.powerOnId, this.onPowerOnChanged);
        } catch {
            // without the power state polling there is no `powerOn` state - the LED stays grey
        }
    }

    componentWillUnmount(): void {
        this.mounted = false;
        super.componentWillUnmount();
        void this.props.oContext.socket.unsubscribeState(this.powerOnId, this.onPowerOnChanged);
    }

    onPowerOnChanged = (_id: string, state: ioBroker.State | null | undefined): void => {
        if (this.mounted) {
            this.setState({ powerOn: state ? !!state.val : null });
        }
    };

    async send(name: string, command: Command): Promise<void> {
        if (this.state.busy || !this.props.alive) {
            return;
        }
        this.setState({ busy: name, error: '' });

        let error = '';
        try {
            const response = (await Promise.race([
                'wake' in command
                    ? this.props.oContext.socket.sendTo(this.target, 'wake', {})
                    : this.props.oContext.socket.sendTo(this.target, 'remote', { key: command.key }),
                new Promise(resolve => setTimeout(() => resolve({ error: 'custom_samsung_no_answer' }), SEND_TIMEOUT)),
            ])) as { error?: string } | null;
            error = response?.error ? I18n.t(response.error) : '';
        } catch (e) {
            error = (e as Error).message || String(e);
        }

        if (this.mounted) {
            this.setState({ busy: null, error });
        }
    }

    onKeyDown = (event: React.KeyboardEvent): void => {
        const key = KEYBOARD[event.key];
        if (key) {
            event.preventDefault();
            void this.send(key, { key });
        }
    };

    renderKey(
        name: string,
        command: Command,
        content: React.ReactNode,
        title: string,
        sx: Record<string, unknown> = {},
    ): React.JSX.Element {
        const busy = this.state.busy === name;
        return (
            <Tooltip
                title={title}
                placement="top"
                enterDelay={600}
            >
                <span>
                    <ButtonBase
                        aria-label={title}
                        disabled={!this.props.alive || (!!this.state.busy && !busy)}
                        onClick={() => void this.send(name, command)}
                        sx={{
                            width: 52,
                            height: 52,
                            borderRadius: '50%',
                            backgroundColor: COLORS.key,
                            color: COLORS.text,
                            boxShadow: '0 2px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
                            transition: 'background-color 120ms, transform 80ms',
                            '&:hover': { backgroundColor: COLORS.keyHover },
                            '&:active': { backgroundColor: COLORS.keyActive, transform: 'scale(0.95)' },
                            '&.Mui-disabled': { opacity: 0.45 },
                            ...sx,
                        }}
                    >
                        {busy ? (
                            <CircularProgress
                                size={20}
                                sx={{ color: COLORS.text }}
                            />
                        ) : (
                            content
                        )}
                    </ButtonBase>
                </span>
            </Tooltip>
        );
    }

    /** One key of the remote control by its Samsung key code */
    code(code: string, content: React.ReactNode, title: string, sx?: Record<string, unknown>): React.JSX.Element {
        return this.renderKey(code, { key: code }, content, title, sx);
    }

    /** A vertical rocker like the volume and channel keys of a real remote */
    renderRocker(up: string, down: string, label: string, upTitle: string, downTitle: string): React.JSX.Element {
        const half = { width: 52, height: 52, backgroundColor: 'transparent', boxShadow: 'none' };
        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    borderRadius: 26,
                    backgroundColor: COLORS.key,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
                }}
            >
                {this.code(up, up === 'KEY_VOLUP' ? <Add /> : <KeyboardArrowUp />, upTitle, half)}
                <Typography sx={{ fontSize: 11, fontWeight: 'bold', color: COLORS.textDim, letterSpacing: 1 }}>
                    {label}
                </Typography>
                {this.code(down, down === 'KEY_VOLDOWN' ? <Remove /> : <KeyboardArrowDown />, downTitle, half)}
            </Box>
        );
    }

    renderDpad(): React.JSX.Element {
        const arrow = { position: 'absolute', backgroundColor: 'transparent', boxShadow: 'none' };
        return (
            <Box
                sx={{
                    position: 'relative',
                    width: 190,
                    height: 190,
                    borderRadius: '50%',
                    backgroundColor: COLORS.ring,
                    boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.05)',
                    my: 1,
                }}
            >
                {this.code('KEY_UP', <KeyboardArrowUp fontSize="large" />, I18n.t('custom_samsung_up'), {
                    ...arrow,
                    top: 4,
                    left: 69,
                })}
                {this.code('KEY_DOWN', <KeyboardArrowDown fontSize="large" />, I18n.t('custom_samsung_down'), {
                    ...arrow,
                    bottom: 4,
                    left: 69,
                })}
                {this.code('KEY_LEFT', <KeyboardArrowLeft fontSize="large" />, I18n.t('custom_samsung_left'), {
                    ...arrow,
                    left: 4,
                    top: 69,
                })}
                {this.code('KEY_RIGHT', <KeyboardArrowRight fontSize="large" />, I18n.t('custom_samsung_right'), {
                    ...arrow,
                    right: 4,
                    top: 69,
                })}
                {this.code('KEY_ENTER', <span style={{ fontWeight: 'bold', fontSize: 16 }}>OK</span>, 'OK', {
                    position: 'absolute',
                    top: 55,
                    left: 55,
                    width: 80,
                    height: 80,
                    backgroundColor: COLORS.ok,
                })}
            </Box>
        );
    }

    renderStatus(): React.JSX.Element {
        const { powerOn } = this.state;
        let color = '#5f6368';
        let text = I18n.t('custom_samsung_state_unknown');
        if (!this.props.alive) {
            text = I18n.t('custom_samsung_not_alive');
        } else if (powerOn === true) {
            color = '#34a853';
            text = I18n.t('custom_samsung_state_on');
        } else if (powerOn === false) {
            color = '#ea4335';
            text = I18n.t('custom_samsung_state_off');
        }
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
                <Box
                    sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: color,
                        boxShadow: powerOn ? `0 0 6px ${color}` : 'none',
                    }}
                />
                <Typography sx={{ fontSize: 12, color: COLORS.textDim }}>{text}</Typography>
            </Box>
        );
    }

    renderItem(): React.JSX.Element {
        const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' };

        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', py: 2 }}>
                <Box
                    tabIndex={0}
                    onKeyDown={this.onKeyDown}
                    sx={{
                        width: 260,
                        px: 3,
                        py: 3,
                        borderRadius: '44px',
                        background: COLORS.body,
                        boxShadow: '0 10px 30px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2,
                        outline: 'none',
                        '&:focus-visible': { boxShadow: '0 0 0 2px #1976d2, 0 10px 30px rgba(0,0,0,0.45)' },
                    }}
                >
                    <Box sx={row}>
                        {this.code('KEY_POWER', <PowerSettingsNew />, I18n.t('custom_samsung_power'), {
                            backgroundColor: COLORS.power,
                            '&:hover': { backgroundColor: COLORS.powerHover },
                        })}
                        {this.renderKey('wake', { wake: true }, <SettingsPower />, I18n.t('custom_samsung_wake'))}
                        {this.code('KEY_SOURCE', <Input />, I18n.t('custom_samsung_source'))}
                    </Box>

                    {this.renderStatus()}

                    <Box sx={row}>
                        {this.code('KEY_MENU', <Menu />, I18n.t('custom_samsung_menu'))}
                        {this.code('KEY_INFO', <Info />, I18n.t('custom_samsung_info'))}
                    </Box>

                    {this.renderDpad()}

                    <Box sx={row}>
                        {this.code('KEY_RETURN', <ArrowBack />, I18n.t('custom_samsung_back'))}
                        {this.code('KEY_HOME', <Home />, I18n.t('custom_samsung_home'))}
                        {this.code('KEY_MUTE', <VolumeOff />, I18n.t('custom_samsung_mute'))}
                    </Box>

                    <Box sx={{ ...row, alignItems: 'stretch' }}>
                        {this.renderRocker(
                            'KEY_VOLUP',
                            'KEY_VOLDOWN',
                            'VOL',
                            I18n.t('custom_samsung_volume_up'),
                            I18n.t('custom_samsung_volume_down'),
                        )}
                        {this.renderRocker(
                            'KEY_CHUP',
                            'KEY_CHDOWN',
                            'CH',
                            I18n.t('custom_samsung_channel_up'),
                            I18n.t('custom_samsung_channel_down'),
                        )}
                    </Box>

                    <Box sx={{ ...row, gap: 0.5 }}>
                        {this.code('KEY_REWIND', <FastRewind fontSize="small" />, I18n.t('custom_samsung_rewind'), {
                            width: 40,
                            height: 40,
                        })}
                        {this.code('KEY_PLAY', <PlayArrow fontSize="small" />, I18n.t('custom_samsung_play'), {
                            width: 40,
                            height: 40,
                        })}
                        {this.code('KEY_PAUSE', <Pause fontSize="small" />, I18n.t('custom_samsung_pause'), {
                            width: 40,
                            height: 40,
                        })}
                        {this.code('KEY_STOP', <Stop fontSize="small" />, I18n.t('custom_samsung_stop'), {
                            width: 40,
                            height: 40,
                        })}
                        {this.code('KEY_FF', <FastForward fontSize="small" />, I18n.t('custom_samsung_forward'), {
                            width: 40,
                            height: 40,
                        })}
                    </Box>

                    <Typography
                        sx={{
                            mt: 1,
                            fontSize: 13,
                            fontWeight: 'bold',
                            letterSpacing: 4,
                            color: COLORS.textDim,
                            userSelect: 'none',
                        }}
                    >
                        SAMSUNG
                    </Typography>
                </Box>

                <Typography
                    role="status"
                    sx={{
                        mt: 2,
                        minHeight: 24,
                        maxWidth: 420,
                        textAlign: 'center',
                        color: this.state.error ? 'error.main' : 'text.secondary',
                        fontSize: 14,
                    }}
                >
                    {this.state.error || I18n.t('custom_samsung_hint')}
                </Typography>
            </Box>
        );
    }
}
