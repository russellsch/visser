---
format: visser/1
docId: cc3d4548-9254-4d8e-846a-8534ab91a540
title: "Dotfiles installation and shell configuration"
kind: architecture
capturedAt: 2026-10-05T01:16:28Z
reader:
  profile: Experienced engineer who is new to this dotfiles repository.
  knows: [shell startup modes, symbolic links, package managers]
  new: [installer flags, target user selection, local override files]
  mustUnderstand:
    - "Predict which installer branches run for an unattended rootless Ubuntu container."
    - "Explain which target-home files installation links and how local zsh files enter startup."
    - "Distinguish an update from an install when configuration links are missing."
visibility: private
---

<!-- vs:id overview -->
# Dotfiles installation and shell configuration

<!-- vs:id p_intro -->
The entry script selects a target user, installs shell tools, and links configuration files into that user's home. The update script upgrades tools and checks selected links. This page describes the code at commit `abc1e037`. {% cite ref="src_flags" /%} {% cite ref="src_update_links" /%}

<!-- vs:id h_owners -->
## Installation delegates shell setup

{% graph id="g_install" mode="architecture" title="The entry script delegates shell setup" question="Which script chooses the target and which script changes its shell files?" %}
The arrows show responsibility and file effects. They do not show execution order.

{% node id="n_entry" label="install.sh" role="process" evidence=["src_flags", "src_uv"] /%}

{% node id="n_common" label="common.sh" role="decision" evidence=["src_machine", "src_target"] /%}

{% node id="n_shell_install" label="zsh/install.sh" role="process" evidence=["src_zsh_pre", "src_links"] /%}

{% node id="n_home" label="Target home" role="storage" evidence=["src_links"] /%}

{% node id="n_git" label="Global Git config" role="storage" evidence=["src_git"] /%}

{% edge id="e_detect" from="n_entry" to="n_common" kind="call" label="loads environment decisions" evidence=["src_flags"] /%}

{% edge id="e_delegate" from="n_entry" to="n_shell_install" kind="call" label="starts shell installation" evidence=["src_uv"] /%}

{% edge id="e_link" from="n_shell_install" to="n_home" kind="data" label="links tracked configuration" evidence=["src_links"] %}
The links point to files in this checkout. A different checkout path needs new links. {% cite ref="src_links" /%}
{% /edge %}

{% edge id="e_git" from="n_entry" to="n_git" kind="data" label="sets global defaults" evidence=["src_git"] /%}
{% /graph %}

<!-- vs:id p_install_path -->
`install.sh` loads `common.sh` before it selects packages. It installs `curl` and `git` through the host package manager if it can use root. It then requires `uv`, calls `zsh/install.sh`, and sets Git defaults for the target user. The shell installer installs zsh and tools, creates links, and tries to select zsh as the default shell. A failed `chsh` call does not stop that installer. {% cite ref="src_flags" /%} {% cite ref="src_packages" /%} {% cite ref="src_uv" /%} {% cite ref="src_git" /%} {% cite ref="src_zsh_pre" /%} {% cite ref="src_links" /%}

<!-- vs:id h_decisions -->
## Terminal input, root access, and flags change the install path

<!-- vs:id p_decisions -->
`common.sh` detects Ubuntu, Arch, or macOS. It rejects a remaining unsupported value. On Linux, it re-executes the script with `sudo` if root access is available. Under `sudo`, it derives the target home from `SUDO_USER`. Without root access, it stays in rootless mode. {% cite ref="src_machine" /%} {% cite ref="src_target" /%}

<!-- vs:id t_branches -->
| Condition | Install effect |
|---|---|
| `--unattended` | Sets container and interactive flags to `true` and `false` before detection. {% cite ref="src_flags" /%} |
| Container detected | Defaults to skipping fonts. Container detection alone does not disable prompts. Input without an attached terminal disables prompts. {% cite ref="src_context" /%} {% cite ref="src_flags" /%} |
| No root access | Skips system package installation and `chsh`; the image must already provide `curl`, `git`, and zsh. {% cite ref="src_packages" /%} {% cite ref="src_zsh_pre" /%} |
| Interactive input | Asks the user to confirm the target home. It can also request missing Git identity values. {% cite ref="src_flags" /%} {% cite ref="src_git" /%} |

<!-- vs:id p_example -->
For an unattended rootless Ubuntu container, the script skips prompts, fonts, system package installation, and `chsh`. It still needs preinstalled `curl`, `git`, and zsh. It installs other tools in user paths where the rootless branches specify those paths. {% cite ref="src_flags" /%} {% cite ref="src_packages" /%} {% cite ref="src_zsh_pre" /%} {% cite ref="src_zsh_tools" /%} {% cite ref="src_links" /%}

<!-- vs:id h_startup -->
## Linked files select shell behavior by session type

<!-- vs:id p_linkset -->
The shell installer links `.zshenv`, `.zprofile`, `.zshrc`, and `.zimrc` into the target home. It also links the Starship and lsd configuration files. These commands use `ln -sfn` against the target paths. {% cite ref="src_links" /%}

<!-- vs:id t_startup -->
| Zsh file | Session and effect | Local file |
|---|---|---|
| `.zshenv` | Every zsh session gets path setup before the shell uses tools. {% cite ref="src_zshenv" /%} | Sources `~/.zshenv.local` if it is readable. {% cite ref="src_zshenv" /%} |
| `.zprofile` | A login shell adds a found Homebrew path. {% cite ref="src_zprofile" /%} | Sources `~/.zprofile.local` if it exists. {% cite ref="src_zprofile" /%} |
| `.zshrc` | An interactive shell loads Zim, sets options, and hooks direnv before Starship. {% cite ref="src_zshrc" /%} | Sources `~/.zshrc.local` if it is readable. {% cite ref="src_zshrc_local" /%} |

<!-- vs:id p_local -->
Put machine-specific environment values in `.zshenv.local`. Put interactive aliases or prompt changes in `.zshrc.local`. The tracked files source these local files at their ends. A `.zprofile.local` file applies login-specific changes. {% cite ref="src_zshenv" /%} {% cite ref="src_zprofile" /%} {% cite ref="src_zshrc_local" /%}

<!-- vs:id h_update -->
## Update upgrades tools but only checks links

<!-- vs:id p_update -->
`update.sh` loads the same environment detector. It upgrades system packages only when the platform and root access permit. It updates fzf, uv, thefuck, Zim modules, and the syntax theme. Its other tool paths also depend on the platform and root access. {% cite ref="src_machine" /%} {% cite ref="src_update_packages" /%} {% cite ref="src_update_tools" /%}

<!-- vs:id p_update_links -->
At the end, the update script checks the targets of the Starship and lsd links. If a checked link differs, it reports the problem and tells the user to rerun `install.sh`. The update path does not create those links. A missing `.zshrc` link is outside this check. {% cite ref="src_update_links" /%} {% cite ref="src_links" /%}

{% detail id="d_revision" label="Snapshot boundary" %}
The captured code comes from commit `abc1e037fdd7d223e796a0703caa23034a9e21dd`. This document does not establish how a later revision behaves.
{% /detail %}

{% source id="src_context" kind="git" title="Container and TTY detection" language="bash" repository="https://github.com/russellsch/dotfiles.git" commit="abc1e037fdd7d223e796a0703caa23034a9e21dd" file="common.sh" start=8 end=18 capturedAt="2026-10-05T01:17:06Z" excerptSha256="2c8337064c94e3c6ba77cfcb7299fbbf0c6a5a3bde609dd0162244b2ca985f37" originFileSha256="0703673dec65847093109e9fbb4cc080dba4a68357704a9812b41e3169734df9" %}
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
{% /source %}

{% source id="src_machine" kind="git" title="OS and root selection" language="bash" repository="https://github.com/russellsch/dotfiles.git" commit="abc1e037fdd7d223e796a0703caa23034a9e21dd" file="common.sh" start=20 end=108 capturedAt="2026-10-05T01:17:22Z" excerptSha256="bd937a01183966ca0f0428004dd24bcd733ccf5bd1f434171f7052a558ee74f5" originFileSha256="0703673dec65847093109e9fbb4cc080dba4a68357704a9812b41e3169734df9" %}
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
{% /source %}

{% source id="src_target" kind="git" title="Target user and home" language="bash" repository="https://github.com/russellsch/dotfiles.git" commit="abc1e037fdd7d223e796a0703caa23034a9e21dd" file="common.sh" start=110 end=123 capturedAt="2026-10-05T01:17:25Z" excerptSha256="be7bd39f77a8ae3fb5f5e863b860cacc2b077af84e011dbe61a033e57b92f7af" originFileSha256="0703673dec65847093109e9fbb4cc080dba4a68357704a9812b41e3169734df9" %}
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
{% /source %}

{% source id="src_flags" kind="git" title="Install flags and prompts" language="bash" repository="https://github.com/russellsch/dotfiles.git" commit="abc1e037fdd7d223e796a0703caa23034a9e21dd" file="install.sh" start=3 end=34 capturedAt="2026-10-05T01:17:29Z" excerptSha256="6049214b358c5d78e5c8627689faf42554d0a6f2d957139f45a13d80e3cfd8f3" originFileSha256="a8d401936f06d78002a2dc705d0fadf68354ae2938441b19a94b6aa49519ef3a" %}
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
{% /source %}

{% source id="src_packages" kind="git" title="Install package branches" language="bash" repository="https://github.com/russellsch/dotfiles.git" commit="abc1e037fdd7d223e796a0703caa23034a9e21dd" file="install.sh" start=38 end=64 capturedAt="2026-10-05T01:17:32Z" excerptSha256="320a371c9dee08135dc9252192808074eb0bb27bb929cbe4e0b7fdc9b81f8b59" originFileSha256="a8d401936f06d78002a2dc705d0fadf68354ae2938441b19a94b6aa49519ef3a" %}
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
{% /source %}

{% source id="src_uv" kind="git" title="uv check and zsh dispatch" language="bash" repository="https://github.com/russellsch/dotfiles.git" commit="abc1e037fdd7d223e796a0703caa23034a9e21dd" file="install.sh" start=66 end=106 capturedAt="2026-10-05T01:17:35Z" excerptSha256="2511bd995ebdec58903762ed6badf89cd79d08d8762595479744b95e7f59499e" originFileSha256="a8d401936f06d78002a2dc705d0fadf68354ae2938441b19a94b6aa49519ef3a" %}
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
{% /source %}

{% source id="src_git" kind="git" title="Git settings" language="bash" repository="https://github.com/russellsch/dotfiles.git" commit="abc1e037fdd7d223e796a0703caa23034a9e21dd" file="install.sh" start=111 end=124 capturedAt="2026-10-05T01:17:39Z" excerptSha256="af2cff89c7f6a7241ccca617079f643001ecae9be9d2322bf4046243778a8fb1" originFileSha256="a8d401936f06d78002a2dc705d0fadf68354ae2938441b19a94b6aa49519ef3a" %}
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
{% /source %}

{% source id="src_zsh_pre" kind="git" title="Zsh and Zim setup" language="bash" repository="https://github.com/russellsch/dotfiles.git" commit="abc1e037fdd7d223e796a0703caa23034a9e21dd" file="zsh/install.sh" start=10 end=35 capturedAt="2026-10-05T01:17:44Z" excerptSha256="27294d3ad84f8b89475fa3b05e889a83a97525ec009ba211caf58d8e7c9e9aef" originFileSha256="e796df1ccc5f8ea9485da35d47a86515925a49450be1fb0a89f69798fa14e5b6" %}
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
{% /source %}

{% source id="src_zsh_tools" kind="git" title="Fonts and shell tools" language="bash" repository="https://github.com/russellsch/dotfiles.git" commit="abc1e037fdd7d223e796a0703caa23034a9e21dd" file="zsh/install.sh" start=38 end=75 capturedAt="2026-10-05T01:17:47Z" excerptSha256="551ce34747b3b92b63cd04e7dd9bbcdde05259fee036d56f0bb993b18dcabdd7" originFileSha256="e796df1ccc5f8ea9485da35d47a86515925a49450be1fb0a89f69798fa14e5b6" %}
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
{% /source %}

{% source id="src_links" kind="git" title="Home links and shell change" language="bash" repository="https://github.com/russellsch/dotfiles.git" commit="abc1e037fdd7d223e796a0703caa23034a9e21dd" file="zsh/install.sh" start=140 end=190 capturedAt="2026-10-05T01:17:50Z" excerptSha256="9c84b6b1f2b71ab99ed207c25b87bc4c74ffe37194db29fd5ceba3ec3806931f" originFileSha256="e796df1ccc5f8ea9485da35d47a86515925a49450be1fb0a89f69798fa14e5b6" %}
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
{% /source %}

{% source id="src_zshenv" kind="git" title="All-zsh configuration" repository="https://github.com/russellsch/dotfiles.git" commit="abc1e037fdd7d223e796a0703caa23034a9e21dd" file="zsh/.zshenv" start=1 end=25 capturedAt="2026-10-05T01:17:55Z" excerptSha256="5f46cc82152aabd0bf9bd63ba9f9a85dd7d2acba7de1c67d56c78afdcbeb6111" originFileSha256="5f46cc82152aabd0bf9bd63ba9f9a85dd7d2acba7de1c67d56c78afdcbeb6111" %}
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
{% /source %}

{% source id="src_zprofile" kind="git" title="Login configuration" repository="https://github.com/russellsch/dotfiles.git" commit="abc1e037fdd7d223e796a0703caa23034a9e21dd" file="zsh/.zprofile" start=1 end=12 capturedAt="2026-10-05T01:18:00Z" excerptSha256="d391b6c8aa0bd9856f52c4eaec570d4dfefba14ebc1d1791a4a84c54ac60c83d" originFileSha256="d391b6c8aa0bd9856f52c4eaec570d4dfefba14ebc1d1791a4a84c54ac60c83d" %}
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
{% /source %}

{% source id="src_zshrc" kind="git" title="Interactive setup" repository="https://github.com/russellsch/dotfiles.git" commit="abc1e037fdd7d223e796a0703caa23034a9e21dd" file="zsh/.zshrc" start=8 end=46 capturedAt="2026-10-05T01:18:03Z" excerptSha256="8ef19b64dcd64310712216b3a5daec9aab597a91f299166f9c67add84c87a317" originFileSha256="35df5985ac80c52666b9ab3bd94ee01a6b502c2435ef601f9c713083ff67c3c3" %}
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
{% /source %}

{% source id="src_zshrc_local" kind="git" title="Interactive local override" repository="https://github.com/russellsch/dotfiles.git" commit="abc1e037fdd7d223e796a0703caa23034a9e21dd" file="zsh/.zshrc" start=69 end=87 capturedAt="2026-10-05T01:18:06Z" excerptSha256="73eebe26b577bdc76a6fef856583e7caa78df496621626fb8ac5e468d8e4ee89" originFileSha256="35df5985ac80c52666b9ab3bd94ee01a6b502c2435ef601f9c713083ff67c3c3" %}
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
{% /source %}

{% source id="src_update_packages" kind="git" title="Update package branches" language="bash" repository="https://github.com/russellsch/dotfiles.git" commit="abc1e037fdd7d223e796a0703caa23034a9e21dd" file="update.sh" start=7 end=30 capturedAt="2026-10-05T01:18:09Z" excerptSha256="052f56886d634891073d637320f7f71bd509293a5bab2a9560a54fda220ba0ba" originFileSha256="4818c44d3527870adb3cd29557afff024880f2b5bd8456e1eb2281f27619670b" %}
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
{% /source %}

{% source id="src_update_tools" kind="git" title="Update tools and plugins" language="bash" repository="https://github.com/russellsch/dotfiles.git" commit="abc1e037fdd7d223e796a0703caa23034a9e21dd" file="update.sh" start=68 end=122 capturedAt="2026-10-05T01:18:12Z" excerptSha256="9fb4ae70cbef89026215dd7e66e424cbb61029f7a5bc15f420084209fa0b8e89" originFileSha256="4818c44d3527870adb3cd29557afff024880f2b5bd8456e1eb2281f27619670b" %}
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
{% /source %}

{% source id="src_update_links" kind="git" title="Update link verification" language="bash" repository="https://github.com/russellsch/dotfiles.git" commit="abc1e037fdd7d223e796a0703caa23034a9e21dd" file="update.sh" start=124 end=158 capturedAt="2026-10-05T01:18:14Z" excerptSha256="101dbf3458324a54e1fec1922ae0347e4ee44f253839f1e4ce1b64feb3f8b51b" originFileSha256="4818c44d3527870adb3cd29557afff024880f2b5bd8456e1eb2281f27619670b" %}
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
{% /source %}
