<!-- visser-text/1 docId=cc3d4548-9254-4d8e-846a-8534ab91a540 -->

<!-- vs:target overview -->
# Dotfiles installation and shell configuration

<!-- vs:target p_intro -->
The installer selects a target user and links shell configuration into that user's home. The updater changes tools and checks selected links. This page describes commit `abc1e037`. [cite: src_flags] [cite: src_links] [cite: src_update_links]

<!-- vs:target h_owners -->
## Install assigns three responsibilities

<!-- vs:target g_install -->
**graph (architecture): Scripts and affected state**

Question: Which script selects the target and links its files?

Arrows name calls or writes, not execution order.

<!-- vs:target n_entry -->
Node Entry: install.sh (process)
The entry script checks for `uv`, a tool installer that it needs for `thefuck`. It stops before shell setup if `uv` remains unavailable. [cite: src_uv] [cite: src_rootless_tools]
Evidence: Install flags and prompts (src_flags)
Evidence: uv check and zsh dispatch (src_uv)

<!-- vs:target n_common -->
Node Detection: common.sh (decision)
The detector honors an existing `MACHINE` value. It derives the target home from `SUDO_USER` only if that variable exists. [cite: src_machine] [cite: src_target]
Evidence: OS and root selection (src_machine)
Evidence: Target user and home (src_target)

<!-- vs:target n_shell_install -->
Node Shell setup: zsh/install.sh (process)
Without root access on Linux, it places Starship, lsd, and direnv in `~/.local/bin`. The linked `.zshenv` adds that directory to the shell path. [cite: src_zsh_tools] [cite: src_rootless_tools] [cite: src_zshenv]
Evidence: Zsh and Zim setup (src_zsh_pre)
Evidence: Home links and shell change (src_links)

<!-- vs:target n_home -->
Node Target home (storage)
Evidence: Home links and shell change (src_links)

<!-- vs:target n_git -->
Node Global Git config (storage)
The installer sets `init.defaultBranch=main` and `pull.rebase=true` for the target user. It asks for missing name and email only during an interactive run. [cite: src_git]
Evidence: Git settings (src_git)

<!-- vs:target e_detect -->
Entry: install.sh --[call; loads environment decisions]--> Detection: common.sh
Evidence: Install flags and prompts (src_flags)

<!-- vs:target e_delegate -->
Entry: install.sh --[call; starts shell installation]--> Shell setup: zsh/install.sh
Evidence: uv check and zsh dispatch (src_uv)

<!-- vs:target e_link -->
Shell setup: zsh/install.sh --[data; links tracked configuration]--> Target home
The links point to this checkout. If the checkout moves, the old links still point to its prior path. [cite: src_links]
Evidence: Home links and shell change (src_links)

<!-- vs:target e_git -->
Entry: install.sh --[data; sets global defaults]--> Global Git config
Evidence: Git settings (src_git)

<!-- vs:target p_install_path -->
`install.sh` loads `common.sh` before package setup. On macOS, it uses Homebrew for `curl` and `git` regardless of `CAN_ROOT`. On Linux, it installs those packages only if root access exists. It then uses an available `uv` or tries to install it, unless `UV_SKIP_INSTALL` has a nonempty value. If `uv` remains absent, installation stops before `zsh/install.sh`. [cite: src_flags] [cite: src_packages] [cite: src_uv]

<!-- vs:target p_shell_path -->
The shell installer installs zsh and tools, creates links, and tries to select zsh as the default shell. A failed `chsh` call does not stop that installer. [cite: src_zsh_pre] [cite: src_zsh_tools] [cite: src_links]

<!-- vs:target h_decisions -->
## Terminal input, root access, and flags change the install path

<!-- vs:target p_decisions -->
`common.sh` accepts Ubuntu, Arch, or macOS. It sets `CAN_ROOT=true` if the process is root or `sudo -n true` succeeds without prompting. On Linux, a non-root process then re-executes the script with `sudo` if `CAN_ROOT=true`. With `SUDO_USER`, it looks up that user's home. Without `SUDO_USER`, it uses `USER` and `HOME`, with `root` and `/root` as fallbacks. [cite: src_machine] [cite: src_target]

<!-- vs:target t_branches -->
| Condition | Install effect |
|---|---|
| `--unattended` | Sets container and interactive flags to `true` and `false` before detection. [cite: src_flags] |
| Container detected | Defaults to skipping fonts. Container detection alone does not disable prompts. Input without an attached terminal disables prompts. [cite: src_context] [cite: src_flags] |
| Linux without root access | Skips system package installation and `chsh`; the image must already provide `curl`, `git`, and zsh. [cite: src_flags] [cite: src_packages] [cite: src_zsh_pre] |
| Interactive input | Asks the user to confirm the target home. It can also request missing Git identity values. [cite: src_flags] [cite: src_git] |

<!-- vs:target p_example -->
With default feature flags, an unattended rootless Ubuntu container skips prompts, fonts, system packages, and `chsh`. An explicit `DOTFILES_SKIP_FONTS=false` overrides the font default. The image still needs `curl`, `git`, and zsh. Rootless branches place Starship, lsd, and direnv in `~/.local/bin`; `.zshenv` adds that path. [cite: src_flags] [cite: src_packages] [cite: src_zsh_pre] [cite: src_zsh_tools] [cite: src_rootless_tools] [cite: src_zshenv]

<!-- vs:target h_startup -->
## Linked files select shell behavior by session type

<!-- vs:target p_linkset -->
The shell installer links `.zshenv`, `.zprofile`, `.zshrc`, and `.zimrc` into the target home. It also links Starship prompt and lsd listing configuration. On success, `ln -sfn` replaces an existing regular file or symbolic link at each destination. The script has no backup step for those paths. [cite: src_links]

<!-- vs:target t_startup -->
| Zsh file | Session and effect | Local file |
|---|---|---|
| `.zshenv` | Every zsh session gets path setup before the shell uses tools. [cite: src_zshenv] | Sources `~/.zshenv.local` if it is readable. [cite: src_zshenv] |
| `.zprofile` | A login shell adds a found Homebrew path. [cite: src_zprofile] | Sources `~/.zprofile.local` if it exists. [cite: src_zprofile] |
| `.zshrc` | An interactive shell loads Zim, sets options, and hooks direnv before Starship. [cite: src_zshrc] | Sources `~/.zshrc.local` if it is readable. [cite: src_zshrc_local] |

<!-- vs:target p_local -->
Put machine-specific environment values in `.zshenv.local`. Put interactive aliases or prompt changes in `.zshrc.local`. The tracked files source these local files at their ends. A `.zprofile.local` file applies login-specific changes. [cite: src_zshenv] [cite: src_zprofile] [cite: src_zshrc_local]

<!-- vs:target h_update -->
## Update upgrades tools but only checks links

<!-- vs:target p_update -->
`update.sh` loads the same environment detector. It upgrades platform packages where its branches allow, refreshes the fzf shell finder to its configured ref, and runs `uv self update` for the Python tool manager. It also upgrades `thefuck`, Zim modules, and the syntax theme. It does not pull this dotfiles checkout. [cite: src_machine] [cite: src_update_packages] [cite: src_update_tools] [cite: src_versions] [cite: src_update_full]

<!-- vs:target p_update_links -->
At the end, the update script checks the targets of the Starship and lsd links. If a checked link differs, it reports the problem and tells the user to rerun `install.sh`. The update path does not create those links. A missing `.zshrc` link is outside this check. [cite: src_update_links] [cite: src_links]

<!-- vs:target d_revision -->
**detail: Snapshot boundary**

The captured code comes from commit `abc1e037fdd7d223e796a0703caa23034a9e21dd`. This document does not establish how a later revision behaves.

<!-- vs:target src_flags -->
**Source: Install flags and prompts**

kind: git
language: bash
repository: https://github.com/russellsch/dotfiles.git
commit: abc1e037fdd7d223e796a0703caa23034a9e21dd
file: install.sh
start: 3
end: 34
excerptSha256: 6049214b358c5d78e5c8627689faf42554d0a6f2d957139f45a13d80e3cfd8f3
capturedAt: 2026-10-05T01:17:29Z

```bash
# --- Parse CLI flags ---
for arg in "$@"; do
    case "$arg" in
        --unattended)
            # Force non-interactive container mode (for devcontainer installCommand)
            export DOTFILES_CONTAINER=true
            export DOTFILES_INTERACTIVE=false
            ;;
    esac
done

source "$(cd "$(dirname "$0")" && pwd)/common.sh"

# Feature flags — sensible defaults, all overridable
DOTFILES_SKIP_FONTS="${DOTFILES_SKIP_FONTS:-$DOTFILES_CONTAINER}"
DOTFILES_SKIP_CHSH="${DOTFILES_SKIP_CHSH:-false}"

# Force-skip operations that require root when running rootless
if [ "$CAN_ROOT" = "false" ]; then
    DOTFILES_SKIP_CHSH=true
fi
export DOTFILES_SKIP_FONTS DOTFILES_SKIP_CHSH

# Confirm the user and home directory
printf '\e[34m%s\e[0m\n' "Installing for user $TARGET_USER with home directory $TARGET_HOME" 1>&2
if [ "$DOTFILES_INTERACTIVE" = "true" ]; then
    read -r -p "Is this correct? " response
    case "$response" in
        [yY])       ;;
        *)    exit 1;;
    esac
fi
```

<!-- vs:target src_links -->
**Source: Home links and shell change**

kind: git
language: bash
repository: https://github.com/russellsch/dotfiles.git
commit: abc1e037fdd7d223e796a0703caa23034a9e21dd
file: zsh/install.sh
start: 140
end: 190
excerptSha256: 9c84b6b1f2b71ab99ed207c25b87bc4c74ffe37194db29fd5ceba3ec3806931f
capturedAt: 2026-10-05T01:17:50Z

```bash

printf '\e[34m%s\e[0m\n' "Creating links..." 1>&2
ln -sfn "$ZSH_INSTALL_DIR/.zshenv" "$TARGET_HOME/.zshenv"
ln -sfn "$ZSH_INSTALL_DIR/.zshrc" "$TARGET_HOME/.zshrc"
ln -sfn "$ZSH_INSTALL_DIR/.zprofile" "$TARGET_HOME/.zprofile"
ln -sfn "$ZSH_INSTALL_DIR/.zimrc" "$TARGET_HOME/.zimrc"

# Create starship config dir and link if config exists
if [ -f "$ZSH_INSTALL_DIR/starship.toml" ]; then
    run_as_user mkdir -p "$TARGET_HOME/.config"
    ln -sfn "$ZSH_INSTALL_DIR/starship.toml" "$TARGET_HOME/.config/starship.toml"
fi
if [ -f "$ZSH_INSTALL_DIR/starship-tty.toml" ]; then
    run_as_user mkdir -p "$TARGET_HOME/.config"
    ln -sfn "$ZSH_INSTALL_DIR/starship-tty.toml" "$TARGET_HOME/.config/starship-tty.toml"
fi

# Create lsd config dir and link theme files
run_as_user mkdir -p "$TARGET_HOME/.config/lsd"
ln -sfn "$ZSH_INSTALL_DIR/lsd/config.yaml" "$TARGET_HOME/.config/lsd/config.yaml"
ln -sfn "$ZSH_INSTALL_DIR/lsd/colors.yaml" "$TARGET_HOME/.config/lsd/colors.yaml"

# Download Catppuccin theme for fast-syntax-highlighting
run_as_user mkdir -p "$TARGET_HOME/.config/fsh"
curl --proto '=https' --tlsv1.2 -fsSL -o "$TARGET_HOME/.config/fsh/catppuccin-macchiato.ini" \
    "https://raw.githubusercontent.com/catppuccin/zsh-fsh/${CATPPUCCIN_FSH_SHA}/themes/catppuccin-macchiato.ini"

# --- Set default shell ---
if [ "$DOTFILES_SKIP_CHSH" != "true" ]; then
    if [ "$MACHINE" = "MacOS" ]; then
        which zsh | run_as_root tee -a /etc/shells > /dev/null
    fi
    printf '\e[34m%s\e[0m\n' "Updating shell..." 1>&2
    if ! run_as_root chsh -s "$(which zsh)" "$TARGET_USER" 2>/dev/null; then
        printf '\e[33m%s\e[0m\n' "chsh failed (non-fatal) — set SHELL manually or use DOTFILES_SKIP_CHSH=true" 1>&2
    fi
else
    printf '\e[33m%s\e[0m\n' "Skipping chsh (DOTFILES_SKIP_CHSH=true)" 1>&2
fi

# --- Install zimfw plugins ---
printf '\e[34m%s\e[0m\n' "Installing zsh plugins via zimfw..." 1>&2
run_as_user zsh -c "export ZIM_HOME=$TARGET_HOME/.zim; source \$ZIM_HOME/zimfw.zsh install"

if [ "$(id -u)" -ne "$(id -u "$TARGET_USER" 2>/dev/null)" ]; then
    chown -R "$TARGET_USER":"$TARGET_USER" "$TARGET_HOME/.zim" 2>/dev/null || true
fi

# --- Activate Catppuccin theme for fast-syntax-highlighting ---
printf '\e[34m%s\e[0m\n' "Activating fast-syntax-highlighting theme..." 1>&2
run_as_user zsh -c "export ZIM_HOME=$TARGET_HOME/.zim; source \$ZIM_HOME/init.zsh; fast-theme XDG:catppuccin-macchiato" &>/dev/null || true
```

<!-- vs:target src_update_links -->
**Source: Update link verification**

kind: git
language: bash
repository: https://github.com/russellsch/dotfiles.git
commit: abc1e037fdd7d223e796a0703caa23034a9e21dd
file: update.sh
start: 124
end: 158
excerptSha256: 101dbf3458324a54e1fec1922ae0347e4ee44f253839f1e4ce1b64feb3f8b51b
capturedAt: 2026-10-05T01:18:14Z

```bash
# --- Verify starship config symlinks ---
printf '\e[34m%s\e[0m\n' "Verifying starship config symlinks..." 1>&2
ok=true
for cfg in starship.toml starship-tty.toml; do
    link="$TARGET_HOME/.config/$cfg"
    target="$DOTFILES_DIR/zsh/$cfg"
    if [ -L "$link" ] && [ "$(readlink "$link")" = "$target" ]; then
        printf '  ✓ %s → %s\n' "$link" "$target" 1>&2
    else
        printf '  \e[33m✗ %s is not linked to %s\e[0m\n' "$link" "$target" 1>&2
        ok=false
    fi
done

printf '\e[34m%s\e[0m\n' "Verifying lsd config symlinks..." 1>&2
for cfg in config.yaml colors.yaml; do
    link="$TARGET_HOME/.config/lsd/$cfg"
    target="$DOTFILES_DIR/zsh/lsd/$cfg"
    if [ -L "$link" ] && [ "$(readlink "$link")" = "$target" ]; then
        printf '  ✓ %s → %s\n' "$link" "$target" 1>&2
    else
        printf '  \e[33m✗ %s is not linked to %s\e[0m\n' "$link" "$target" 1>&2
        ok=false
    fi
done

printf '\e[34m%s\e[0m\n' "Starship version:" 1>&2
run_as_user starship --version 1>&2

# --- Done ---
if [ "$ok" = true ]; then
    printf '\n\e[32;1m%s\e[0m\n' "Update complete! Open a new shell to pick up any changes." 1>&2
else
    printf '\n\e[33;1m%s\e[0m\n' "Update complete, but some symlinks need attention. Re-run install.sh to fix." 1>&2
fi
```

<!-- vs:target src_uv -->
**Source: uv check and zsh dispatch**

kind: git
language: bash
repository: https://github.com/russellsch/dotfiles.git
commit: abc1e037fdd7d223e796a0703caa23034a9e21dd
file: install.sh
start: 66
end: 106
excerptSha256: 2511bd995ebdec58903762ed6badf89cd79d08d8762595479744b95e7f59499e
capturedAt: 2026-10-05T01:17:35Z

```bash
printf '\e[34m%s\e[0m\n' "Installing Dependency: uv ..." 1>&2
# Helper: source the cargo-dist env file from well-known install locations.
# This adds whichever directory the installer chose to PATH (handles /opt/bin
# in containers, CARGO_HOME overrides, etc.).
_source_uv_env() {
    for _uv_env in \
        "$TARGET_HOME/.local/bin/env" \
        "$TARGET_HOME/.cargo/bin/env" \
        "${CARGO_HOME:+$CARGO_HOME/bin/env}" \
        /opt/bin/env; do
        if [ -n "$_uv_env" ] && [ -f "$_uv_env" ]; then
            # shellcheck disable=SC1090
            . "$_uv_env"
            return 0
        fi
    done
    return 1
}
# Source early so an already-installed uv at a non-standard location (e.g.
# /opt/bin) is discovered before we download.  Using `command -v` (instead of
# run_as_user) avoids sudo resetting PATH and hiding the binary.
_source_uv_env || true
if [ -z "${UV_SKIP_INSTALL:-}" ] && ! command -v uv &>/dev/null; then
    # Download installer to a temp file instead of piping (curl|sh swallows errors)
    curl --proto '=https' --tlsv1.2 -LsSf -o /tmp/uv-installer.sh \
        https://github.com/astral-sh/uv/releases/download/0.10.2/uv-installer.sh
    run_as_user sh /tmp/uv-installer.sh
    rm -f /tmp/uv-installer.sh
    # Re-source to pick up the newly created env file
    _source_uv_env || true
fi
unset -f _source_uv_env
# Verify uv is available
if ! command -v uv &>/dev/null; then
    printf '\e[31;1m%s\e[0m\n' "ERROR: uv installation failed — uv not found on PATH" 1>&2
    printf '\e[31m%s\e[0m\n' "PATH=$PATH" 1>&2
    exit 1
fi

# Setup zsh
(cd zsh || exit 1; ./install.sh)
```

<!-- vs:target src_rootless_tools -->
**Source: Rootless tool locations**

kind: git
language: bash
repository: https://github.com/russellsch/dotfiles.git
commit: abc1e037fdd7d223e796a0703caa23034a9e21dd
file: zsh/install.sh
start: 77
end: 138
excerptSha256: a547c934fe419ebd3ffbeb318ea9b25c0f68b09f71d42a3fed26b64ea699b392
capturedAt: 2026-10-05T01:24:33Z

```bash
printf '\e[34m%s\e[0m\n' "Installing lsd (ls replacement)..." 1>&2
if [ "$MACHINE" = "MacOS" ]; then
    brew install lsd
elif [ "$MACHINE" = "Ubuntu" ] || [ "$MACHINE" = "Arch" ]; then
    case "$(uname -m)" in
        x86_64)  LSD_ARCH=amd64; LSD_TRIPLE=x86_64-unknown-linux-gnu ;;
        aarch64) LSD_ARCH=arm64; LSD_TRIPLE=aarch64-unknown-linux-gnu ;;
        *)       LSD_ARCH=amd64; LSD_TRIPLE=x86_64-unknown-linux-gnu ;;
    esac
    if [ "$CAN_ROOT" = "true" ]; then
        if [ "$MACHINE" = "Arch" ]; then
            pacman -S lsd --noconfirm  # Arch repos have recent versions
        else
            # Install from GitHub releases for hex color support (requires >=1.1.0)
            LSD_DEB="lsd_${LSD_VERSION#v}_${LSD_ARCH}.deb"
            curl --proto '=https' --tlsv1.2 -fsSL -o "/tmp/$LSD_DEB" \
                "https://github.com/lsd-rs/lsd/releases/download/${LSD_VERSION}/${LSD_DEB}"
            dpkg -i "/tmp/$LSD_DEB"
            rm -f "/tmp/$LSD_DEB"
        fi
    else
        # Rootless: install binary to user directory from tar.gz
        run_as_user mkdir -p "$TARGET_HOME/.local/bin"
        LSD_TAR="lsd-${LSD_VERSION}-${LSD_TRIPLE}.tar.gz"
        curl --proto '=https' --tlsv1.2 -fsSL -o "/tmp/$LSD_TAR" \
            "https://github.com/lsd-rs/lsd/releases/download/${LSD_VERSION}/${LSD_TAR}"
        tar -xf "/tmp/$LSD_TAR" -C /tmp
        install -m 755 "/tmp/lsd-${LSD_VERSION}-${LSD_TRIPLE}/lsd" "$TARGET_HOME/.local/bin/lsd"
        rm -rf "/tmp/$LSD_TAR" "/tmp/lsd-${LSD_VERSION}-${LSD_TRIPLE}"
    fi
fi

printf '\e[34m%s\e[0m\n' "Installing thefuck..." 1>&2
# shellcheck disable=SC2016
run_as_user bash -c '
    for _f in "$HOME/.local/bin/env" "$HOME/.cargo/bin/env" /opt/bin/env; do
        [ -f "$_f" ] && . "$_f" && break
    done
    uv tool install thefuck
'

printf '\e[34m%s\e[0m\n' "Installing direnv..." 1>&2
if [ "$MACHINE" = "MacOS" ]; then
    brew install direnv
elif [ "$CAN_ROOT" = "true" ]; then
    if [ "$MACHINE" = "Ubuntu" ]; then
        apt-get install direnv -y
    elif [ "$MACHINE" = "Arch" ]; then
        pacman -S direnv --noconfirm
    fi
else
    # Rootless: install binary to user directory from GitHub
    run_as_user mkdir -p "$TARGET_HOME/.local/bin"
    case "$(uname -m)" in
        x86_64)  DIRENV_ARCH=amd64 ;;
        aarch64) DIRENV_ARCH=arm64 ;;
        *)       DIRENV_ARCH=amd64 ;;
    esac
    curl --proto '=https' --tlsv1.2 -fsSL -o "$TARGET_HOME/.local/bin/direnv" \
        "https://github.com/direnv/direnv/releases/download/${DIRENV_VERSION}/direnv.linux-${DIRENV_ARCH}"
    chmod +x "$TARGET_HOME/.local/bin/direnv"
fi
```

<!-- vs:target src_machine -->
**Source: OS and root selection**

kind: git
language: bash
repository: https://github.com/russellsch/dotfiles.git
commit: abc1e037fdd7d223e796a0703caa23034a9e21dd
file: common.sh
start: 20
end: 108
excerptSha256: bd937a01183966ca0f0428004dd24bcd733ccf5bd1f434171f7052a558ee74f5
capturedAt: 2026-10-05T01:17:22Z

```bash
# --- OS detection (skip if already set, e.g. preserved through sudo) ---
if [ -z "${MACHINE:-}" ]; then
    unameOut="$(uname -s)"
    case "$unameOut" in
        Linux*)     machine=Linux;;
        Darwin*)    machine=MacOS;;
        *)          machine="UNKNOWN:$unameOut";;
    esac

    # If this is an unknown distro, ask user to override using Ubuntu or MacOS config
    if [ "$machine" = "UNKNOWN:$unameOut" ]; then
        if [ "$DOTFILES_INTERACTIVE" = "true" ]; then
            read -r -p "Unknown installation ($machine); Assume [U]buntu [M]acOS or [A]rch? " response
            case "$response" in
                [uU])  machine=Ubuntu;;
                [mM])  machine=MacOS;;
                [aA])  machine=Arch;;
                *)                  ;;
            esac
        else
            printf '\e[33m%s\e[0m\n' "Unknown distro ($machine), defaulting to Ubuntu" 1>&2
            machine=Ubuntu
        fi
    fi

    # If this is a Linux system, detect the distro
    if [ "$machine" = "Linux" ]; then
        if [ -f /etc/os-release ]; then
            # shellcheck disable=SC1091
            . /etc/os-release
            case "${ID:-} ${ID_LIKE:-}" in
                *ubuntu*) machine=Ubuntu;;
                *arch*)   machine=Arch;;
                *)        unameOut="$(uname -v)"; machine="UNKNOWN:$unameOut";;
            esac
        else
            unameOut="$(uname -v)"
            case "$unameOut" in
                *Ubuntu*)    machine=Ubuntu;;
                *)           machine="UNKNOWN:$unameOut";;
            esac
        fi
    fi

    # If this is an unknown distro, ask user to override using Ubuntu or MacOS config
    if [ "$machine" = "UNKNOWN:$unameOut" ]; then
        if [ "$DOTFILES_INTERACTIVE" = "true" ]; then
            read -r -p "Unknown installation ($machine); Assume [U]buntu [M]acOS or [A]rch? " response
            case "$response" in
                [uU])  machine=Ubuntu;;
                [mM])  machine=MacOS;;
                [aA])  machine=Arch;;
                *)                  ;;
            esac
        else
            printf '\e[33m%s\e[0m\n' "Unknown distro ($machine), defaulting to Ubuntu" 1>&2
            machine=Ubuntu
        fi
    fi

    export MACHINE=$machine
fi

if [ "$MACHINE" = "Ubuntu" ] || [ "$MACHINE" = "MacOS" ] || [ "$MACHINE" = "Arch" ]; then
    :
else
    printf '\e[31;1m%s\e[0m\n' "Unsupported environment: '$MACHINE'" 1>&2
    exit 1
fi

# --- Detect whether root privileges are available ---
if [ "$(id -u)" -eq 0 ]; then
    CAN_ROOT=true
elif command -v sudo &>/dev/null && sudo -n true 2>/dev/null; then
    CAN_ROOT=true
else
    CAN_ROOT=false
fi
export CAN_ROOT

# --- Self-elevate to root if needed (not on macOS — Homebrew refuses root) ---
if [ "$(id -u)" -ne 0 ] && [ "$MACHINE" != "MacOS" ]; then
    if [ "$CAN_ROOT" = "true" ]; then
        printf '\e[34m%s\e[0m\n' "Root privileges required. Re-running with sudo..." 1>&2
        exec sudo --preserve-env=DOTFILES_CONTAINER,DOTFILES_INTERACTIVE,DOTFILES_SKIP_FONTS,DOTFILES_SKIP_CHSH,MACHINE,CARGO_HOME "$0" "$@"
    else
        printf '\e[33m%s\e[0m\n' "No root privileges available — running in rootless mode (system packages must be pre-installed)" 1>&2
    fi
fi
```

<!-- vs:target src_target -->
**Source: Target user and home**

kind: git
language: bash
repository: https://github.com/russellsch/dotfiles.git
commit: abc1e037fdd7d223e796a0703caa23034a9e21dd
file: common.sh
start: 110
end: 123
excerptSha256: be7bd39f77a8ae3fb5f5e863b860cacc2b077af84e011dbe61a033e57b92f7af
capturedAt: 2026-10-05T01:17:25Z

```bash
# --- Derive target user and home (never rely on $HOME under sudo) ---
if [ -n "${SUDO_USER:-}" ]; then
    TARGET_USER="$SUDO_USER"
    if command -v getent &>/dev/null; then
        TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
    else
        TARGET_HOME="$(dscl . -read /Users/"$TARGET_USER" NFSHomeDirectory | awk '{print $2}')"
    fi
else
    # Running as root without sudo (e.g. containers), or as normal user (macOS)
    TARGET_USER="${USER:-root}"
    TARGET_HOME="${HOME:-/root}"
fi
export TARGET_USER TARGET_HOME
```

<!-- vs:target src_zsh_tools -->
**Source: Fonts and shell tools**

kind: git
language: bash
repository: https://github.com/russellsch/dotfiles.git
commit: abc1e037fdd7d223e796a0703caa23034a9e21dd
file: zsh/install.sh
start: 38
end: 75
excerptSha256: 551ce34747b3b92b63cd04e7dd9bbcdde05259fee036d56f0bb993b18dcabdd7
capturedAt: 2026-10-05T01:17:47Z

```bash
# --- Nerd Fonts ---
if [ "$DOTFILES_SKIP_FONTS" != "true" ]; then
    FONT_DIR="$TARGET_HOME/.local/share/fonts"
    printf '\e[34m%s\e[0m\n' "Installing Nerd Fonts (FiraCode, DroidSansMono)..." 1>&2
    if [ "$MACHINE" = "Ubuntu" ]; then
        run_as_user mkdir -p "$FONT_DIR"
        for font in FiraCode DroidSansMono; do
            curl --proto '=https' --tlsv1.2 -fsSL -o "/tmp/${font}.tar.xz" \
                "https://github.com/ryanoasis/nerd-fonts/releases/download/${NERD_FONTS_VERSION}/${font}.tar.xz"
            run_as_user tar -xf "/tmp/${font}.tar.xz" -C "$FONT_DIR"
            rm "/tmp/${font}.tar.xz"
        done
        fc-cache -f
    elif [ "$MACHINE" = "MacOS" ]; then
        brew install --cask font-fira-code-nerd-font font-droid-sans-mono-nerd-font
    elif [ "$MACHINE" = "Arch" ]; then
        pacman -S ttf-firacode-nerd ttf-droid --noconfirm
    fi
else
    printf '\e[33m%s\e[0m\n' "Skipping Nerd Fonts (DOTFILES_SKIP_FONTS=true)" 1>&2
fi

printf '\e[34m%s\e[0m\n' "Installing Dependency: Starship..." 1>&2
if [ "$MACHINE" = "MacOS" ]; then
    brew install starship
elif [ "$CAN_ROOT" = "true" ]; then
    curl --proto '=https' --tlsv1.2 -fsSL https://starship.rs/install.sh | sh -s -- -y -v "$STARSHIP_VERSION"
else
    run_as_user mkdir -p "$TARGET_HOME/.local/bin"
    curl --proto '=https' --tlsv1.2 -fsSL https://starship.rs/install.sh | sh -s -- -y -v "$STARSHIP_VERSION" -b "$TARGET_HOME/.local/bin"
fi

printf '\e[34m%s\e[0m\n' "Installing fzf (from GitHub)..." 1>&2
FZF_DIR="$TARGET_HOME/.fzf"
if [ ! -d "$FZF_DIR" ]; then
    run_as_user git clone --branch "$FZF_VERSION" --depth 1 https://github.com/junegunn/fzf.git "$FZF_DIR"
fi
run_as_user "$FZF_DIR/install" --bin
```

<!-- vs:target src_zshenv -->
**Source: All-zsh configuration**

kind: git
repository: https://github.com/russellsch/dotfiles.git
commit: abc1e037fdd7d223e796a0703caa23034a9e21dd
file: zsh/.zshenv
start: 1
end: 25
excerptSha256: 5f46cc82152aabd0bf9bd63ba9f9a85dd7d2acba7de1c67d56c78afdcbeb6111
capturedAt: 2026-10-05T01:17:55Z

```
# Prevent Ubuntu's /etc/zsh/zshrc from calling compinit before Zim's completion module
skip_global_compinit=1

# ~/.local/bin houses user-local installs (uv, and starship/lsd/direnv in rootless mode)
# ~/.cargo/bin is where the uv installer (cargo-dist) may place the uv binary
# $CARGO_HOME/bin handles containers that set CARGO_HOME to non-standard locations (e.g. /opt)
# ~/.fzf/bin is where the fzf install script puts the binary (--bin mode)
# All must be on PATH before Zim's fzf module and .zshrc's starship/direnv init
path=(~/.local/bin ~/.cargo/bin ~/.fzf/bin $path)
[[ -n "$CARGO_HOME" && "$CARGO_HOME" != ~/.cargo ]] && path=($CARGO_HOME/bin $path)
# The uv installer (cargo-dist) creates an env file next to the binary that adds
# the install directory to PATH.  Source it to handle non-standard install locations
# (e.g. /opt/bin in container images that set CARGO_HOME=/opt at build time).
for _uvenv in \
    ~/.local/bin/env \
    ~/.cargo/bin/env \
    ${CARGO_HOME:+$CARGO_HOME/bin/env} \
    /opt/bin/env
do
    [[ -n "$_uvenv" && -f "$_uvenv" ]] && source "$_uvenv" && break
done
unset _uvenv

# Machine-local env can be applied via $HOME/.zshenv.local; applies to every zsh
[[ -r "$HOME/.zshenv.local" ]] && source "$HOME/.zshenv.local"
```

<!-- vs:target src_git -->
**Source: Git settings**

kind: git
language: bash
repository: https://github.com/russellsch/dotfiles.git
commit: abc1e037fdd7d223e796a0703caa23034a9e21dd
file: install.sh
start: 111
end: 124
excerptSha256: af2cff89c7f6a7241ccca617079f643001ecae9be9d2322bf4046243778a8fb1
capturedAt: 2026-10-05T01:17:39Z

```bash
run_as_user git config --global init.defaultBranch main
run_as_user git config --global pull.rebase true

if [ "$DOTFILES_INTERACTIVE" = "true" ]; then
    if ! run_as_user git config user.name &>/dev/null || ! run_as_user git config user.email &>/dev/null; then
        printf '\e[34m%s\e[0m\n' "Setting global git user..." 1>&2
        read -r -p "Git user name: " git_name
        read -r -p "Git email: " git_email
        run_as_user git config --global user.name "$git_name"
        run_as_user git config --global user.email "$git_email"
    fi
fi

exit 0
```

<!-- vs:target src_packages -->
**Source: Install package branches**

kind: git
language: bash
repository: https://github.com/russellsch/dotfiles.git
commit: abc1e037fdd7d223e796a0703caa23034a9e21dd
file: install.sh
start: 38
end: 64
excerptSha256: 320a371c9dee08135dc9252192808074eb0bb27bb929cbe4e0b7fdc9b81f8b59
capturedAt: 2026-10-05T01:17:32Z

```bash
printf '\e[34m%s\e[0m\n' "Setting script permissions..." 1>&2
chmod +x ./*/install.sh

printf '\e[34m%s\e[0m\n' "Installing universal dependencies..." 1>&2
if [ "$MACHINE" = "MacOS" ]; then
    if ! command -v brew &>/dev/null; then
        # Homebrew/install pinned to 5838cadb (2026-02-19)
        /bin/bash -c "$(curl --proto '=https' --tlsv1.2 -fsSL https://raw.githubusercontent.com/Homebrew/install/5838cadbb2c7beb17c7dcdddb5f0dba6c4780feb/install.sh)" </dev/null
        # Add Homebrew to PATH for this session
        if [[ -x /opt/homebrew/bin/brew ]]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        elif [[ -x /usr/local/bin/brew ]]; then
            eval "$(/usr/local/bin/brew shellenv)"
        fi
    fi
    brew install curl git
elif [ "$CAN_ROOT" = "true" ]; then
    if [ "$MACHINE" = "Ubuntu" ]; then
        apt-get update
        apt-get install curl git -y
    elif [ "$MACHINE" = "Arch" ]; then
        pacman -Sy --noconfirm
        pacman -S curl git --noconfirm
    fi
else
    printf '\e[33m%s\e[0m\n' "Rootless mode: skipping system package install (curl, git must be pre-installed)" 1>&2
fi
```

<!-- vs:target src_zsh_pre -->
**Source: Zsh and Zim setup**

kind: git
language: bash
repository: https://github.com/russellsch/dotfiles.git
commit: abc1e037fdd7d223e796a0703caa23034a9e21dd
file: zsh/install.sh
start: 10
end: 35
excerptSha256: 27294d3ad84f8b89475fa3b05e889a83a97525ec009ba211caf58d8e7c9e9aef
capturedAt: 2026-10-05T01:17:44Z

```bash
printf '\e[34m%s\e[0m\n' "Installing ZSH..." 1>&2
if [ "$MACHINE" = "MacOS" ]; then
    brew install zsh
elif [ "$CAN_ROOT" = "true" ]; then
    if [ "$MACHINE" = "Ubuntu" ]; then
        apt-get install zsh -y
    elif [ "$MACHINE" = "Arch" ]; then
        pacman -S zsh --noconfirm
    fi
else
    if ! command -v zsh &>/dev/null; then
        printf '\e[31;1m%s\e[0m\n' "ERROR: zsh is not installed and cannot be installed without root. Install zsh in your container image." 1>&2
        exit 1
    fi
    printf '\e[33m%s\e[0m\n' "Rootless mode: using pre-installed zsh ($(which zsh))" 1>&2
fi

printf '\e[34m%s\e[0m\n' "Installing Dependency: Zim Framework..." 1>&2
if [ -d "$TARGET_HOME/.zim" ]; then
    printf '\e[33m%s\e[0m\n' "Zim Framework already installed, skipping..." 1>&2
else
    # zimfw/install pinned to 55a2a28d (2026-02-19)
    # Set SHELL=zsh so the installer skips its own chsh call (which prompts for
    # a password via PAM).  We handle chsh separately below with root privileges.
    run_as_user env SHELL="$(command -v zsh)" zsh -c "$(curl --proto '=https' --tlsv1.2 -fsSL https://raw.githubusercontent.com/zimfw/install/55a2a28dfef53b9a12a16e38279f662363229c69/install.zsh)"
fi
```

<!-- vs:target src_context -->
**Source: Container and TTY detection**

kind: git
language: bash
repository: https://github.com/russellsch/dotfiles.git
commit: abc1e037fdd7d223e796a0703caa23034a9e21dd
file: common.sh
start: 8
end: 18
excerptSha256: 2c8337064c94e3c6ba77cfcb7299fbbf0c6a5a3bde609dd0162244b2ca985f37
capturedAt: 2026-10-05T01:17:06Z

```bash
# --- Environment detection ---
DOTFILES_CONTAINER="${DOTFILES_CONTAINER:-false}"
[ -f /.dockerenv ] && DOTFILES_CONTAINER=true
[ "${CODESPACES:-}" = "true" ] && DOTFILES_CONTAINER=true
[ "${REMOTE_CONTAINERS:-}" = "true" ] && DOTFILES_CONTAINER=true
[ -n "${container:-}" ] && DOTFILES_CONTAINER=true  # systemd-nspawn, podman

DOTFILES_INTERACTIVE="${DOTFILES_INTERACTIVE:-true}"
[ ! -t 0 ] && DOTFILES_INTERACTIVE=false

export DOTFILES_CONTAINER DOTFILES_INTERACTIVE
```

<!-- vs:target src_zprofile -->
**Source: Login configuration**

kind: git
repository: https://github.com/russellsch/dotfiles.git
commit: abc1e037fdd7d223e796a0703caa23034a9e21dd
file: zsh/.zprofile
start: 1
end: 12
excerptSha256: d391b6c8aa0bd9856f52c4eaec570d4dfefba14ebc1d1791a4a84c54ac60c83d
capturedAt: 2026-10-05T01:18:00Z

```
# --- Homebrew ---
# Check standard installation paths and source shellenv if found
for _brew_prefix in /opt/homebrew /usr/local /home/linuxbrew/.linuxbrew; do
    if [[ -x "$_brew_prefix/bin/brew" ]]; then
        eval "$("$_brew_prefix/bin/brew" shellenv)"
        break
    fi
done
unset _brew_prefix

# --- Machine-local login configuration ---
[[ -f ~/.zprofile.local ]] && source ~/.zprofile.local
```

<!-- vs:target src_zshrc -->
**Source: Interactive setup**

kind: git
repository: https://github.com/russellsch/dotfiles.git
commit: abc1e037fdd7d223e796a0703caa23034a9e21dd
file: zsh/.zshrc
start: 8
end: 46
excerptSha256: 8ef19b64dcd64310712216b3a5daec9aab597a91f299166f9c67add84c87a317
capturedAt: 2026-10-05T01:18:03Z

```
# --- Autosuggestions tuning (must be set BEFORE zim init) ---
# magic-enter rebinds ^M to 'buffer-empty', so we must clear on that widget too
ZSH_AUTOSUGGEST_CLEAR_WIDGETS+=(accept-line buffer-empty)

# --- zimfw bootstrap ---
ZIM_HOME=~/.zim
if [[ -f ${ZIM_HOME}/zimfw.zsh ]]; then
    [[ -f ${ZIM_HOME}/init.zsh ]] || source ${ZIM_HOME}/zimfw.zsh init -q
    [[ -f ${ZIM_HOME}/init.zsh ]] && source ${ZIM_HOME}/init.zsh
else
    print -u2 "zsh: zimfw not found at ${ZIM_HOME}/zimfw.zsh"
fi

# --- Sane options (replaces zsh-saneopt) ---
setopt AUTO_CD AUTO_PUSHD PUSHD_IGNORE_DUPS
setopt HIST_IGNORE_ALL_DUPS HIST_SAVE_NO_DUPS HIST_REDUCE_BLANKS SHARE_HISTORY
setopt INTERACTIVE_COMMENTS EXTENDED_GLOB
HISTSIZE=50000
SAVEHIST=50000
HISTFILE=~/.zsh_history

# When in tty swap to different starship config so different fonts can be used
if [[ "$TERM" == "linux" ]]; then
  export STARSHIP_CONFIG="$HOME/.config/starship-tty.toml"
fi

# --- direnv (must hook before starship so DIRENV_FILE is set for first prompt) ---
if (( $+commands[direnv] )); then
    eval "$(direnv hook zsh)"
else
    print -u2 "zsh: direnv not found"
fi

# --- Prompt ---
if (( $+commands[starship] )); then
    eval "$(starship init zsh)"
else
    print -u2 "zsh: starship not found"
fi
```

<!-- vs:target src_zshrc_local -->
**Source: Interactive local override**

kind: git
repository: https://github.com/russellsch/dotfiles.git
commit: abc1e037fdd7d223e796a0703caa23034a9e21dd
file: zsh/.zshrc
start: 69
end: 87
excerptSha256: 73eebe26b577bdc76a6fef856583e7caa78df496621626fb8ac5e468d8e4ee89
capturedAt: 2026-10-05T01:18:06Z

```
# --- thefuck (lazy loaded) ---
fuck() {
    unfunction fuck
    eval "$(thefuck --alias)"
    fuck "$@"
}

# --- Key bindings ---
[[ "$TERM_PROGRAM" == "ghostty" ]] && export TERM=xterm-256color
WORDCHARS=${WORDCHARS/\/}         # Treat / as a word boundary
# Key binding fixes for alt+ arrow keys
bindkey '\e[1;3C' forward-word    # Alt+Right
bindkey '\e[1;3D' backward-word   # Alt+Left

# Double-Escape to clear the current input line
bindkey '\e\e' kill-whole-line

# Machine-local interactive config - can be applied via $HOME/.zshrc.local
[[ -r "$HOME/.zshrc.local" ]] && source "$HOME/.zshrc.local"
```

<!-- vs:target src_update_packages -->
**Source: Update package branches**

kind: git
language: bash
repository: https://github.com/russellsch/dotfiles.git
commit: abc1e037fdd7d223e796a0703caa23034a9e21dd
file: update.sh
start: 7
end: 30
excerptSha256: 052f56886d634891073d637320f7f71bd509293a5bab2a9560a54fda220ba0ba
capturedAt: 2026-10-05T01:18:09Z

```bash
# --- Update system packages ---
printf '\e[34m%s\e[0m\n' "Updating system packages (zsh, direnv)..." 1>&2
if [ "$MACHINE" = "MacOS" ]; then
    # Ensure Homebrew is in PATH (handles non-interactive shells, cron, etc.)
    if ! command -v brew &>/dev/null; then
        for _brew_prefix in /opt/homebrew /usr/local; do
            if [[ -x "$_brew_prefix/bin/brew" ]]; then
                eval "$("$_brew_prefix/bin/brew" shellenv)"
                break
            fi
        done
        unset _brew_prefix
    fi
    brew upgrade zsh lsd direnv starship
elif [ "$CAN_ROOT" = "true" ]; then
    if [ "$MACHINE" = "Ubuntu" ]; then
        apt-get update
        apt-get install --only-upgrade -y zsh direnv
    elif [ "$MACHINE" = "Arch" ]; then
        pacman -Syu --noconfirm zsh lsd direnv
    fi
else
    printf '\e[33m%s\e[0m\n' "Rootless mode: skipping system package updates" 1>&2
fi
```

<!-- vs:target src_update_tools -->
**Source: Update tools and plugins**

kind: git
language: bash
repository: https://github.com/russellsch/dotfiles.git
commit: abc1e037fdd7d223e796a0703caa23034a9e21dd
file: update.sh
start: 68
end: 122
excerptSha256: 9fb4ae70cbef89026215dd7e66e424cbb61029f7a5bc15f420084209fa0b8e89
capturedAt: 2026-10-05T01:18:12Z

```bash
# --- Update fzf ---
printf '\e[34m%s\e[0m\n' "Updating fzf..." 1>&2
if [ -d "$TARGET_HOME/.fzf" ]; then
    run_as_user git -C "$TARGET_HOME/.fzf" fetch --tags
    run_as_user git -C "$TARGET_HOME/.fzf" checkout "$FZF_VERSION"
else
    run_as_user git clone --branch "$FZF_VERSION" --depth 1 https://github.com/junegunn/fzf.git "$TARGET_HOME/.fzf"
fi
run_as_user "$TARGET_HOME/.fzf/install" --bin

# --- Update uv + thefuck ---
printf '\e[34m%s\e[0m\n' "Updating uv..." 1>&2
# shellcheck disable=SC2016
run_as_user bash -c '
    for _f in "$HOME/.local/bin/env" "$HOME/.cargo/bin/env" /opt/bin/env; do
        [ -f "$_f" ] && . "$_f" && break
    done
    uv self update
'

printf '\e[34m%s\e[0m\n' "Updating thefuck..." 1>&2
# shellcheck disable=SC2016
run_as_user bash -c '
    for _f in "$HOME/.local/bin/env" "$HOME/.cargo/bin/env" /opt/bin/env; do
        [ -f "$_f" ] && . "$_f" && break
    done
    uv tool upgrade thefuck
'

# --- Update direnv (rootless only — system installs handled by package manager above) ---
if [ "$CAN_ROOT" = "false" ] && [ "$MACHINE" != "MacOS" ]; then
    printf '\e[34m%s\e[0m\n' "Updating direnv..." 1>&2
    run_as_user mkdir -p "$TARGET_HOME/.local/bin"
    case "$(uname -m)" in
        x86_64)  DIRENV_ARCH=amd64 ;;
        aarch64) DIRENV_ARCH=arm64 ;;
        *)       DIRENV_ARCH=amd64 ;;
    esac
    curl --proto '=https' --tlsv1.2 -fsSL -o "$TARGET_HOME/.local/bin/direnv" \
        "https://github.com/direnv/direnv/releases/download/${DIRENV_VERSION}/direnv.linux-${DIRENV_ARCH}"
    chmod +x "$TARGET_HOME/.local/bin/direnv"
fi

# --- Zimfw update/install/compile ---
printf '\e[34m%s\e[0m\n' "Updating zimfw modules..." 1>&2
run_as_user zsh -c "export ZIM_HOME=$TARGET_HOME/.zim; source \$ZIM_HOME/zimfw.zsh update"
run_as_user zsh -c "export ZIM_HOME=$TARGET_HOME/.zim; source \$ZIM_HOME/zimfw.zsh install"
run_as_user zsh -c "export ZIM_HOME=$TARGET_HOME/.zim; source \$ZIM_HOME/zimfw.zsh compile"

# Update and re-apply Catppuccin theme for fast-syntax-highlighting
printf '\e[34m%s\e[0m\n' "Updating fast-syntax-highlighting theme..." 1>&2
run_as_user mkdir -p "$TARGET_HOME/.config/fsh"
curl --proto '=https' --tlsv1.2 -fsSL -o "$TARGET_HOME/.config/fsh/catppuccin-macchiato.ini" \
    "https://raw.githubusercontent.com/catppuccin/zsh-fsh/${CATPPUCCIN_FSH_SHA}/themes/catppuccin-macchiato.ini"
run_as_user zsh -c "export ZIM_HOME=$TARGET_HOME/.zim; source \$ZIM_HOME/init.zsh; fast-theme XDG:catppuccin-macchiato" &>/dev/null || true
```

<!-- vs:target src_versions -->
**Source: Configured dependency versions**

kind: git
language: bash
repository: https://github.com/russellsch/dotfiles.git
commit: abc1e037fdd7d223e796a0703caa23034a9e21dd
file: common.sh
start: 146
end: 153
excerptSha256: f4f65cdd5e0084ab585c7cf01787af1f455a2867f42c3a089cec326207c7a8b0
capturedAt: 2026-10-05T01:24:18Z

```bash
# --- Pinned dependency versions ---
STARSHIP_VERSION="v1.24.2"
FZF_VERSION="v0.68.0"
NERD_FONTS_VERSION="v3.4.0"
LSD_VERSION="v1.2.0"
CATPPUCCIN_FSH_SHA="a9bdf479f8982c4b83b5c5005c8231c6b3352e2a"  # catppuccin/zsh-fsh (2026-02-21)
DIRENV_VERSION="v2.35.0"
export STARSHIP_VERSION FZF_VERSION NERD_FONTS_VERSION LSD_VERSION CATPPUCCIN_FSH_SHA DIRENV_VERSION
```

<!-- vs:target src_update_full -->
**Source: Complete update script**

kind: git
language: bash
repository: https://github.com/russellsch/dotfiles.git
commit: abc1e037fdd7d223e796a0703caa23034a9e21dd
file: update.sh
start: 1
end: 158
excerptSha256: 4818c44d3527870adb3cd29557afff024880f2b5bd8456e1eb2281f27619670b
capturedAt: 2026-10-05T01:24:46Z

```bash
#!/bin/bash

source "$(cd "$(dirname "$0")" && pwd)/common.sh"

printf '\n\e[34;1m%s\e[0m\n\n' "=== Dotfiles Update ($MACHINE) ===" 1>&2

# --- Update system packages ---
printf '\e[34m%s\e[0m\n' "Updating system packages (zsh, direnv)..." 1>&2
if [ "$MACHINE" = "MacOS" ]; then
    # Ensure Homebrew is in PATH (handles non-interactive shells, cron, etc.)
    if ! command -v brew &>/dev/null; then
        for _brew_prefix in /opt/homebrew /usr/local; do
            if [[ -x "$_brew_prefix/bin/brew" ]]; then
                eval "$("$_brew_prefix/bin/brew" shellenv)"
                break
            fi
        done
        unset _brew_prefix
    fi
    brew upgrade zsh lsd direnv starship
elif [ "$CAN_ROOT" = "true" ]; then
    if [ "$MACHINE" = "Ubuntu" ]; then
        apt-get update
        apt-get install --only-upgrade -y zsh direnv
    elif [ "$MACHINE" = "Arch" ]; then
        pacman -Syu --noconfirm zsh lsd direnv
    fi
else
    printf '\e[33m%s\e[0m\n' "Rootless mode: skipping system package updates" 1>&2
fi

# --- Update starship binary ---
if [ "$MACHINE" != "MacOS" ]; then
    printf '\e[34m%s\e[0m\n' "Updating starship..." 1>&2
    if [ "$CAN_ROOT" = "true" ]; then
        curl --proto '=https' --tlsv1.2 -fsSL https://starship.rs/install.sh | sh -s -- -y -v "$STARSHIP_VERSION"
    else
        run_as_user mkdir -p "$TARGET_HOME/.local/bin"
        curl --proto '=https' --tlsv1.2 -fsSL https://starship.rs/install.sh | sh -s -- -y -v "$STARSHIP_VERSION" -b "$TARGET_HOME/.local/bin"
    fi
fi

# --- Update lsd from GitHub releases (Ubuntu/Arch rootless; macOS/Arch-root handled above) ---
if [ "$MACHINE" = "Ubuntu" ] || { [ "$MACHINE" = "Arch" ] && [ "$CAN_ROOT" = "false" ]; }; then
    printf '\e[34m%s\e[0m\n' "Updating lsd..." 1>&2
    case "$(uname -m)" in
        x86_64)  LSD_ARCH=amd64; LSD_TRIPLE=x86_64-unknown-linux-gnu ;;
        aarch64) LSD_ARCH=arm64; LSD_TRIPLE=aarch64-unknown-linux-gnu ;;
        *)       LSD_ARCH=amd64; LSD_TRIPLE=x86_64-unknown-linux-gnu ;;
    esac
    if [ "$CAN_ROOT" = "true" ]; then
        LSD_DEB="lsd_${LSD_VERSION#v}_${LSD_ARCH}.deb"
        curl --proto '=https' --tlsv1.2 -fsSL -o "/tmp/$LSD_DEB" \
            "https://github.com/lsd-rs/lsd/releases/download/${LSD_VERSION}/${LSD_DEB}"
        dpkg -i "/tmp/$LSD_DEB"
        rm -f "/tmp/$LSD_DEB"
    else
        run_as_user mkdir -p "$TARGET_HOME/.local/bin"
        LSD_TAR="lsd-${LSD_VERSION}-${LSD_TRIPLE}.tar.gz"
        curl --proto '=https' --tlsv1.2 -fsSL -o "/tmp/$LSD_TAR" \
            "https://github.com/lsd-rs/lsd/releases/download/${LSD_VERSION}/${LSD_TAR}"
        tar -xf "/tmp/$LSD_TAR" -C /tmp
        install -m 755 "/tmp/lsd-${LSD_VERSION}-${LSD_TRIPLE}/lsd" "$TARGET_HOME/.local/bin/lsd"
        rm -rf "/tmp/$LSD_TAR" "/tmp/lsd-${LSD_VERSION}-${LSD_TRIPLE}"
    fi
fi

# --- Update fzf ---
printf '\e[34m%s\e[0m\n' "Updating fzf..." 1>&2
if [ -d "$TARGET_HOME/.fzf" ]; then
    run_as_user git -C "$TARGET_HOME/.fzf" fetch --tags
    run_as_user git -C "$TARGET_HOME/.fzf" checkout "$FZF_VERSION"
else
    run_as_user git clone --branch "$FZF_VERSION" --depth 1 https://github.com/junegunn/fzf.git "$TARGET_HOME/.fzf"
fi
run_as_user "$TARGET_HOME/.fzf/install" --bin

# --- Update uv + thefuck ---
printf '\e[34m%s\e[0m\n' "Updating uv..." 1>&2
# shellcheck disable=SC2016
run_as_user bash -c '
    for _f in "$HOME/.local/bin/env" "$HOME/.cargo/bin/env" /opt/bin/env; do
        [ -f "$_f" ] && . "$_f" && break
    done
    uv self update
'

printf '\e[34m%s\e[0m\n' "Updating thefuck..." 1>&2
# shellcheck disable=SC2016
run_as_user bash -c '
    for _f in "$HOME/.local/bin/env" "$HOME/.cargo/bin/env" /opt/bin/env; do
        [ -f "$_f" ] && . "$_f" && break
    done
    uv tool upgrade thefuck
'

# --- Update direnv (rootless only — system installs handled by package manager above) ---
if [ "$CAN_ROOT" = "false" ] && [ "$MACHINE" != "MacOS" ]; then
    printf '\e[34m%s\e[0m\n' "Updating direnv..." 1>&2
    run_as_user mkdir -p "$TARGET_HOME/.local/bin"
    case "$(uname -m)" in
        x86_64)  DIRENV_ARCH=amd64 ;;
        aarch64) DIRENV_ARCH=arm64 ;;
        *)       DIRENV_ARCH=amd64 ;;
    esac
    curl --proto '=https' --tlsv1.2 -fsSL -o "$TARGET_HOME/.local/bin/direnv" \
        "https://github.com/direnv/direnv/releases/download/${DIRENV_VERSION}/direnv.linux-${DIRENV_ARCH}"
    chmod +x "$TARGET_HOME/.local/bin/direnv"
fi

# --- Zimfw update/install/compile ---
printf '\e[34m%s\e[0m\n' "Updating zimfw modules..." 1>&2
run_as_user zsh -c "export ZIM_HOME=$TARGET_HOME/.zim; source \$ZIM_HOME/zimfw.zsh update"
run_as_user zsh -c "export ZIM_HOME=$TARGET_HOME/.zim; source \$ZIM_HOME/zimfw.zsh install"
run_as_user zsh -c "export ZIM_HOME=$TARGET_HOME/.zim; source \$ZIM_HOME/zimfw.zsh compile"

# Update and re-apply Catppuccin theme for fast-syntax-highlighting
printf '\e[34m%s\e[0m\n' "Updating fast-syntax-highlighting theme..." 1>&2
run_as_user mkdir -p "$TARGET_HOME/.config/fsh"
curl --proto '=https' --tlsv1.2 -fsSL -o "$TARGET_HOME/.config/fsh/catppuccin-macchiato.ini" \
    "https://raw.githubusercontent.com/catppuccin/zsh-fsh/${CATPPUCCIN_FSH_SHA}/themes/catppuccin-macchiato.ini"
run_as_user zsh -c "export ZIM_HOME=$TARGET_HOME/.zim; source \$ZIM_HOME/init.zsh; fast-theme XDG:catppuccin-macchiato" &>/dev/null || true

# --- Verify starship config symlinks ---
printf '\e[34m%s\e[0m\n' "Verifying starship config symlinks..." 1>&2
ok=true
for cfg in starship.toml starship-tty.toml; do
    link="$TARGET_HOME/.config/$cfg"
    target="$DOTFILES_DIR/zsh/$cfg"
    if [ -L "$link" ] && [ "$(readlink "$link")" = "$target" ]; then
        printf '  ✓ %s → %s\n' "$link" "$target" 1>&2
    else
        printf '  \e[33m✗ %s is not linked to %s\e[0m\n' "$link" "$target" 1>&2
        ok=false
    fi
done

printf '\e[34m%s\e[0m\n' "Verifying lsd config symlinks..." 1>&2
for cfg in config.yaml colors.yaml; do
    link="$TARGET_HOME/.config/lsd/$cfg"
    target="$DOTFILES_DIR/zsh/lsd/$cfg"
    if [ -L "$link" ] && [ "$(readlink "$link")" = "$target" ]; then
        printf '  ✓ %s → %s\n' "$link" "$target" 1>&2
    else
        printf '  \e[33m✗ %s is not linked to %s\e[0m\n' "$link" "$target" 1>&2
        ok=false
    fi
done

printf '\e[34m%s\e[0m\n' "Starship version:" 1>&2
run_as_user starship --version 1>&2

# --- Done ---
if [ "$ok" = true ]; then
    printf '\n\e[32;1m%s\e[0m\n' "Update complete! Open a new shell to pick up any changes." 1>&2
else
    printf '\n\e[33;1m%s\e[0m\n' "Update complete, but some symlinks need attention. Re-run install.sh to fix." 1>&2
fi
```
