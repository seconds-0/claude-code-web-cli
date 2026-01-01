packer {
  required_plugins {
    hcloud = {
      version = ">= 1.2.0"
      source  = "github.com/hetznercloud/hcloud"
    }
  }
}

variable "hcloud_token" {
  type      = string
  sensitive = true
  default   = env("HETZNER_API_TOKEN")
}

variable "location" {
  type    = string
  default = "nbg1"
}

variable "server_type" {
  type    = string
  default = "cpx11"
}

variable "image_name" {
  type    = string
  default = "ccc-workspace"
}

source "hcloud" "ubuntu" {
  token         = var.hcloud_token
  image         = "ubuntu-22.04"
  location      = var.location
  server_type   = var.server_type
  server_name   = "packer-ccc-builder"
  ssh_username  = "root"
  snapshot_name = "${var.image_name}-${formatdate("YYYYMMDD-HHmmss", timestamp())}"
  snapshot_labels = {
    "app"     = "claude-code-cloud"
    "managed" = "packer"
  }
}

build {
  sources = ["source.hcloud.ubuntu"]

  # Create scripts directory
  provisioner "shell" {
    inline = ["mkdir -p /tmp/scripts"]
  }

  # Copy setup scripts
  provisioner "file" {
    source      = "../scripts/"
    destination = "/tmp/scripts"
  }

  # Make scripts executable
  provisioner "shell" {
    inline = [
      "chmod +x /tmp/scripts/*.sh"
    ]
  }

  # Run main setup script
  provisioner "shell" {
    script = "../scripts/setup.sh"
    environment_vars = [
      "DEBIAN_FRONTEND=noninteractive"
    ]
  }

  # Install ttyd
  provisioner "shell" {
    script = "../scripts/install-ttyd.sh"
    environment_vars = [
      "DEBIAN_FRONTEND=noninteractive"
    ]
  }

  # Install Tailscale
  provisioner "shell" {
    script = "../scripts/install-tailscale.sh"
    environment_vars = [
      "DEBIAN_FRONTEND=noninteractive"
    ]
  }

  # Install Claude Code CLI
  provisioner "shell" {
    script = "../scripts/install-claude-cli.sh"
    environment_vars = [
      "DEBIAN_FRONTEND=noninteractive"
    ]
  }

  # Install Claude auth capture service (watches for OAuth completion)
  provisioner "shell" {
    script = "../scripts/install-claude-auth-capture.sh"
    environment_vars = [
      "DEBIAN_FRONTEND=noninteractive"
    ]
  }

  # Install Claude wrapper with QR codes and better UX
  provisioner "shell" {
    script = "../scripts/install-claude-wrapper.sh"
    environment_vars = [
      "DEBIAN_FRONTEND=noninteractive"
    ]
  }

  # Install Caddy for direct connect mode (optional low-latency)
  provisioner "shell" {
    script = "../scripts/install-caddy.sh"
    environment_vars = [
      "DEBIAN_FRONTEND=noninteractive"
    ]
  }

  # Clean up
  provisioner "shell" {
    inline = [
      "rm -rf /tmp/scripts",
      "apt-get clean",
      "rm -rf /var/lib/apt/lists/*"
    ]
  }
}
