import React from 'react';

import {
    Alert,
    Box,
    Button,
    Card,
    CardActionArea,
    CardContent,
    Checkbox,
    Chip,
    CircularProgress,
    FormControlLabel,
    LinearProgress,
    Step,
    StepContent,
    StepLabel,
    Stepper,
    TextField,
    Typography,
} from '@mui/material';
import { CheckCircle, Search, Tv } from '@mui/icons-material';
import { I18n } from '@iobroker/gui-components';
import { ConfigGeneric, type ConfigGenericProps, type ConfigGenericState } from '@iobroker/json-config';

/** A TV as `listTvs` and `deviceInfo` of the instance describe it */
interface FoundTv {
    ip: string;
    name: string;
    model: string;
    mac: string;
    powerState: string;
    networkType: string;
    frameTv: boolean;
    tokenAuthSupport: boolean;
}

type ErrorCode = 'denied' | 'timeout' | 'unreachable' | 'noToken' | 'protocol';

interface SendToResponse {
    error?: string;
    code?: ErrorCode;
    tvs?: FoundTv[];
    device?: FoundTv;
    token?: string;
}

interface SetupWizardState extends ConfigGenericState {
    /** Shows the summary of an existing configuration instead of the steps */
    configured: boolean;
    step: number;
    searching: boolean;
    tvs: FoundTv[] | null;
    manualIp: string;
    checkingIp: boolean;
    tv: FoundTv | null;
    pairing: boolean;
    secondsLeft: number;
    token: string;
    useWol: boolean;
    mac: string;
    testing: boolean;
    testSent: boolean;
    error: { code: ErrorCode; text: string } | null;
}

/** How long the TV waits for the user, plus some margin - the countdown of the pairing step */
const PAIRING_SECONDS = 40;
/** The `ipAddress` default of io-package.json - not a configured TV */
const DEFAULT_IP = '192.168.0.1';

/**
 * Assistant for the first setup: find the TV, pair, Wake-on-LAN, test, save.
 *
 * Everything goes through `sendTo` to the running instance, but with the data being entered here - not
 * with the saved configuration. Only the last step writes the values into the form (`onChange` with the
 * whole native object), which opens the save dialog of admin.
 */
export default class SetupWizardComponent extends ConfigGeneric<ConfigGenericProps, SetupWizardState> {
    private mounted = false;
    private countdown: ReturnType<typeof setInterval> | null = null;

    constructor(props: ConfigGenericProps) {
        super(props);
        const ip = String(props.data.ipAddress ?? '');
        this.state = {
            ...this.state,
            configured: !!ip && ip !== DEFAULT_IP,
            step: 0,
            searching: false,
            tvs: null,
            manualIp: '',
            checkingIp: false,
            tv: null,
            pairing: false,
            secondsLeft: 0,
            token: '',
            useWol: true,
            mac: '',
            testing: false,
            testSent: false,
            error: null,
        };
    }

    async componentDidMount(): Promise<void> {
        void super.componentDidMount();
        this.mounted = true;
        if (!this.state.configured && this.props.alive) {
            await this.search();
        }
    }

    componentWillUnmount(): void {
        this.mounted = false;
        this.stopCountdown();
        super.componentWillUnmount();
    }

    get target(): string {
        return `${this.props.oContext.adapterName}.${this.props.oContext.instance}`;
    }

    async request(command: string, message: Record<string, unknown> = {}): Promise<SendToResponse> {
        try {
            return (await this.props.oContext.socket.sendTo(this.target, command, message)) ?? {};
        } catch (e) {
            return { error: (e as Error).message || String(e), code: 'protocol' };
        }
    }

    /** Text for an error code of the instance */
    errorText(code: ErrorCode | undefined, fallback?: string): string {
        switch (code) {
            case 'denied':
                return I18n.t('custom_samsung_setup_err_denied');
            case 'timeout':
                return I18n.t('custom_samsung_setup_err_timeout');
            case 'unreachable':
                return I18n.t('custom_samsung_setup_err_unreachable');
            case 'noToken':
                return I18n.t('custom_samsung_setup_err_no_token');
            default:
                return fallback ? I18n.t(fallback) : I18n.t('custom_samsung_setup_err_unknown');
        }
    }

    async search(): Promise<void> {
        this.setState({ searching: true, error: null });
        const response = await this.request('listTvs');
        if (!this.mounted) {
            return;
        }
        const tvs = response.tvs ?? [];
        this.setState({
            searching: false,
            tvs,
            error: response.error ? { code: 'protocol', text: this.errorText(response.code, response.error) } : null,
        });
        // the only TV found is the one to set up
        if (tvs.length === 1 && !this.state.tv) {
            this.selectTv(tvs[0]);
        }
    }

    async checkManualIp(): Promise<void> {
        const ip = this.state.manualIp.trim();
        if (!ip) {
            return;
        }
        this.setState({ checkingIp: true, error: null });
        const response = await this.request('deviceInfo', { ip });
        if (!this.mounted) {
            return;
        }
        if (response.device) {
            this.setState({ checkingIp: false });
            this.selectTv(response.device);
        } else {
            this.setState({ checkingIp: false, error: { code: 'unreachable', text: this.errorText('unreachable') } });
        }
    }

    selectTv(tv: FoundTv): void {
        this.setState({ tv, mac: tv.mac, token: '', testSent: false, error: null });
    }

    get protocol(): string {
        return this.state.tv?.tokenAuthSupport === false ? 'http' : 'wss';
    }

    get port(): string {
        return this.protocol === 'wss' ? '8002' : '8001';
    }

    stopCountdown(): void {
        if (this.countdown) {
            clearInterval(this.countdown);
            this.countdown = null;
        }
    }

    async pair(): Promise<void> {
        const tv = this.state.tv;
        if (!tv) {
            return;
        }
        this.setState({ pairing: true, secondsLeft: PAIRING_SECONDS, error: null });
        this.countdown = setInterval(
            () => this.mounted && this.setState(state => ({ secondsLeft: Math.max(0, state.secondsLeft - 1) })),
            1000,
        );
        const response = await this.request('pair', { ip: tv.ip, protocol: this.protocol, port: this.port });
        this.stopCountdown();
        if (!this.mounted) {
            return;
        }
        if (response.token) {
            this.setState({ pairing: false, token: response.token, step: 2 });
        } else {
            this.setState({
                pairing: false,
                error: { code: response.code ?? 'protocol', text: this.errorText(response.code, response.error) },
            });
        }
    }

    async test(): Promise<void> {
        const tv = this.state.tv;
        if (!tv) {
            return;
        }
        this.setState({ testing: true, testSent: false, error: null });
        const response = await this.request('testKey', {
            ip: tv.ip,
            protocol: this.protocol,
            port: this.port,
            token: this.state.token,
            key: 'KEY_INFO',
        });
        if (!this.mounted) {
            return;
        }
        this.setState({
            testing: false,
            testSent: !response.error,
            error: response.error
                ? { code: response.code ?? 'protocol', text: this.errorText(response.code, response.error) }
                : null,
        });
    }

    /** Write all values into the form and open the save dialog of admin */
    apply(): void {
        const tv = this.state.tv;
        if (!tv) {
            return;
        }
        const values = {
            ipAddress: tv.ip,
            protocol: this.protocol,
            port: this.port,
            token: this.state.token || '0',
            macAddress: this.state.useWol && this.state.mac ? this.state.mac : '0',
        };
        const data = { ...this.props.data, ...values };
        this.props.onChange(data, undefined, () => this.props.oContext.forceUpdate(Object.keys(values), data), true);
        this.setState({ configured: true });
    }

    restart(): void {
        this.setState({ configured: false, step: 0, tv: null, token: '', testSent: false, error: null }, () => {
            if (this.props.alive && !this.state.tvs) {
                void this.search();
            }
        });
    }

    renderError(): React.JSX.Element | null {
        return this.state.error ? (
            <Alert
                severity="error"
                sx={{ mt: 1 }}
            >
                {this.state.error.text}
            </Alert>
        ) : null;
    }

    renderTvCard(tv: FoundTv): React.JSX.Element {
        const selected = this.state.tv?.ip === tv.ip;
        return (
            <Card
                key={tv.ip}
                variant="outlined"
                sx={{ width: 260, borderColor: selected ? 'primary.main' : undefined, borderWidth: selected ? 2 : 1 }}
            >
                <CardActionArea onClick={() => this.selectTv(tv)}>
                    <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                        <Tv sx={{ fontSize: 40, color: selected ? 'primary.main' : 'text.secondary' }} />
                        <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 'bold' }}>{tv.name || tv.model}</Typography>
                            <Typography
                                variant="body2"
                                color="text.secondary"
                            >
                                {tv.model} · {tv.ip}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                                <Chip
                                    size="small"
                                    color={tv.powerState === 'on' ? 'success' : 'default'}
                                    label={
                                        tv.powerState === 'on'
                                            ? I18n.t('custom_samsung_state_on')
                                            : I18n.t('custom_samsung_setup_standby')
                                    }
                                />
                                {tv.frameTv ? (
                                    <Chip
                                        size="small"
                                        label="The Frame"
                                    />
                                ) : null}
                                <Chip
                                    size="small"
                                    variant="outlined"
                                    label={
                                        tv.networkType === 'wireless'
                                            ? I18n.t('custom_samsung_setup_wlan')
                                            : I18n.t('custom_samsung_setup_lan')
                                    }
                                />
                            </Box>
                        </Box>
                        {selected ? <CheckCircle color="primary" /> : null}
                    </CardContent>
                </CardActionArea>
            </Card>
        );
    }

    renderFindStep(): React.JSX.Element {
        const { tvs, searching } = this.state;
        return (
            <Box>
                <Typography sx={{ mb: 1 }}>{I18n.t('custom_samsung_setup_find_text')}</Typography>
                <Button
                    variant="outlined"
                    startIcon={searching ? <CircularProgress size={18} /> : <Search />}
                    disabled={searching || !this.props.alive}
                    onClick={() => void this.search()}
                >
                    {searching ? I18n.t('custom_samsung_setup_searching') : I18n.t('custom_samsung_setup_search_again')}
                </Button>
                {searching ? <LinearProgress sx={{ mt: 1 }} /> : null}
                {tvs && !searching && !tvs.length ? (
                    <Alert
                        severity="info"
                        sx={{ mt: 1 }}
                    >
                        {I18n.t('custom_samsung_setup_none_found')}
                    </Alert>
                ) : null}
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', my: 2 }}>
                    {(tvs ?? []).map(tv => this.renderTvCard(tv))}
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <TextField
                        size="small"
                        variant="standard"
                        label={I18n.t('custom_samsung_setup_manual_ip')}
                        value={this.state.manualIp}
                        onChange={e => this.setState({ manualIp: e.target.value })}
                        onKeyDown={e => e.key === 'Enter' && void this.checkManualIp()}
                    />
                    <Button
                        size="small"
                        disabled={!this.state.manualIp.trim() || this.state.checkingIp || !this.props.alive}
                        onClick={() => void this.checkManualIp()}
                    >
                        {this.state.checkingIp ? <CircularProgress size={18} /> : I18n.t('custom_samsung_setup_check')}
                    </Button>
                </Box>
                {this.renderError()}
                <Box sx={{ mt: 2 }}>
                    <Button
                        variant="contained"
                        disabled={!this.state.tv}
                        onClick={() =>
                            this.setState({
                                // TVs without token support (older models on port 8001) need no pairing
                                step: this.state.tv?.tokenAuthSupport === false ? 2 : 1,
                                error: null,
                            })
                        }
                    >
                        {I18n.t('custom_samsung_setup_next')}
                    </Button>
                </Box>
            </Box>
        );
    }

    renderPairStep(): React.JSX.Element {
        const { pairing, secondsLeft, tv } = this.state;
        return (
            <Box>
                <Typography sx={{ mb: 1 }}>
                    {I18n.t('custom_samsung_setup_pair_text', tv?.name || tv?.model || '')}
                </Typography>
                <Box
                    component="ol"
                    sx={{ mt: 0, pl: 3 }}
                >
                    <li>{I18n.t('custom_samsung_setup_pair_hint_on')}</li>
                    <li>{I18n.t('custom_samsung_setup_pair_hint_click')}</li>
                    <li>{I18n.t('custom_samsung_setup_pair_hint_allow')}</li>
                </Box>
                {pairing ? (
                    <Alert
                        severity="info"
                        icon={<CircularProgress size={20} />}
                    >
                        {I18n.t('custom_samsung_setup_pair_waiting', secondsLeft)}
                    </Alert>
                ) : null}
                {this.renderError()}
                <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                    <Button
                        onClick={() => this.setState({ step: 0, error: null })}
                        disabled={pairing}
                    >
                        {I18n.t('custom_samsung_setup_back')}
                    </Button>
                    <Button
                        variant="contained"
                        disabled={pairing || !this.props.alive}
                        onClick={() => void this.pair()}
                    >
                        {this.state.error
                            ? I18n.t('custom_samsung_setup_pair_retry')
                            : I18n.t('custom_samsung_setup_pair_start')}
                    </Button>
                </Box>
            </Box>
        );
    }

    renderPowerStep(): React.JSX.Element {
        const { tv } = this.state;
        return (
            <Box>
                {this.state.token ? (
                    <Alert
                        severity="success"
                        sx={{ mb: 2 }}
                    >
                        {I18n.t('custom_samsung_setup_paired')}
                    </Alert>
                ) : null}
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={this.state.useWol}
                            onChange={e => this.setState({ useWol: e.target.checked })}
                        />
                    }
                    label={I18n.t('custom_samsung_setup_wol')}
                />
                {this.state.useWol ? (
                    <Box sx={{ pl: 4 }}>
                        <TextField
                            size="small"
                            variant="standard"
                            label={I18n.t('custom_samsung_setup_mac')}
                            value={this.state.mac}
                            onChange={e => this.setState({ mac: e.target.value })}
                            helperText={tv?.mac ? I18n.t('custom_samsung_setup_mac_from_tv') : ''}
                        />
                        <Alert
                            severity="info"
                            sx={{ mt: 1 }}
                        >
                            {I18n.t('custom_samsung_setup_wol_hint')}
                            {tv?.networkType === 'wireless' ? ` ${I18n.t('custom_samsung_setup_wol_wlan')}` : ''}
                        </Alert>
                    </Box>
                ) : null}
                <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                    <Button onClick={() => this.setState({ step: tv?.tokenAuthSupport === false ? 0 : 1 })}>
                        {I18n.t('custom_samsung_setup_back')}
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => this.setState({ step: 3, error: null })}
                    >
                        {I18n.t('custom_samsung_setup_next')}
                    </Button>
                </Box>
            </Box>
        );
    }

    renderTestStep(): React.JSX.Element {
        const { tv, testing, testSent } = this.state;
        return (
            <Box>
                <Typography sx={{ mb: 1 }}>{I18n.t('custom_samsung_setup_test_text')}</Typography>
                <Button
                    variant="outlined"
                    disabled={testing || !this.props.alive}
                    startIcon={testing ? <CircularProgress size={18} /> : null}
                    onClick={() => void this.test()}
                >
                    {I18n.t('custom_samsung_setup_test_button')}
                </Button>
                {testSent ? (
                    <Alert
                        severity="success"
                        sx={{ mt: 1 }}
                    >
                        {I18n.t('custom_samsung_setup_test_sent')}
                    </Alert>
                ) : null}
                {this.renderError()}
                <Box
                    component="table"
                    sx={{ mt: 2, borderSpacing: '16px 4px', ml: -2 }}
                >
                    <tbody>
                        <tr>
                            <td>{I18n.t('custom_samsung_setup_sum_tv')}</td>
                            <td>
                                {tv?.name} ({tv?.model})
                            </td>
                        </tr>
                        <tr>
                            <td>{I18n.t('custom_samsung_setup_sum_address')}</td>
                            <td>
                                {tv?.ip} · {this.protocol} · {this.port}
                            </td>
                        </tr>
                        <tr>
                            <td>{I18n.t('custom_samsung_setup_sum_token')}</td>
                            <td>
                                {this.state.token && this.state.token !== '0'
                                    ? I18n.t('custom_samsung_setup_sum_token_set')
                                    : I18n.t('custom_samsung_setup_sum_token_none')}
                            </td>
                        </tr>
                        <tr>
                            <td>{I18n.t('custom_samsung_setup_sum_wol')}</td>
                            <td>{this.state.useWol && this.state.mac ? this.state.mac : '-'}</td>
                        </tr>
                    </tbody>
                </Box>
                <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                    <Button onClick={() => this.setState({ step: 2 })}>{I18n.t('custom_samsung_setup_back')}</Button>
                    <Button
                        variant="contained"
                        onClick={() => this.apply()}
                    >
                        {I18n.t('custom_samsung_setup_apply')}
                    </Button>
                </Box>
            </Box>
        );
    }

    renderSummary(): React.JSX.Element {
        const data = this.props.data;
        return (
            <Box>
                <Alert severity="success">
                    {I18n.t('custom_samsung_setup_configured', String(data.ipAddress ?? ''))}
                    {data.token && data.token !== '0' ? ` ${I18n.t('custom_samsung_setup_configured_token')}` : ''}
                </Alert>
                <Button
                    sx={{ mt: 2 }}
                    variant="outlined"
                    onClick={() => this.restart()}
                >
                    {I18n.t('custom_samsung_setup_restart')}
                </Button>
            </Box>
        );
    }

    renderItem(): React.JSX.Element {
        if (!this.props.alive) {
            return <Alert severity="warning">{I18n.t('custom_samsung_setup_not_alive')}</Alert>;
        }
        if (this.state.configured) {
            return this.renderSummary();
        }
        const steps = [
            { label: 'custom_samsung_setup_step_find', render: () => this.renderFindStep() },
            { label: 'custom_samsung_setup_step_pair', render: () => this.renderPairStep() },
            { label: 'custom_samsung_setup_step_power', render: () => this.renderPowerStep() },
            { label: 'custom_samsung_setup_step_test', render: () => this.renderTestStep() },
        ];
        return (
            <Box sx={{ maxWidth: 900 }}>
                <Stepper
                    activeStep={this.state.step}
                    orientation="vertical"
                >
                    {steps.map(step => (
                        <Step key={step.label}>
                            <StepLabel>{I18n.t(step.label)}</StepLabel>
                            <StepContent>{step.render()}</StepContent>
                        </Step>
                    ))}
                </Stepper>
            </Box>
        );
    }
}
