include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-fakehttp
PKG_VERSION:=0.9.18
PKG_RELEASE:=1

PKG_MAINTAINER:=FakeHTTP LuCI feed
PKG_LICENSE:=GPL-3.0-or-later

LUCI_TITLE:=LuCI support for FakeHTTP
LUCI_DESCRIPTION:=Web interface to configure and monitor FakeHTTP traffic obfuscation
LUCI_DEPENDS:=+fakehttp
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
